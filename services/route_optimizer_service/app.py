"""Route optimizer service.

Minimal runtime entrypoint that composes helpers and exposes required
endpoints. Keep other logic in sibling modules (`logging_setup.py`,
`auth.py`, `solver.py`, `rules.py`, `scorer.py`, `metrics.py`).
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from datetime import datetime

from logging_setup import logger, LOG_DIR
from metrics import REQ_COUNTER, REQ_DURATION, DECISIONS_COUNTER, generate_latest, CONTENT_TYPE_LATEST
from auth import rate_limit_key, authenticate_service_request
from solver import compute_euclidean_matrix, solve_tsp_distance_matrix
from rules import enforce_rules
from scorer import score_route

from flask_limiter import Limiter


app = Flask(__name__)

cors_origins = os.environ.get("ROUTE_CORS_ORIGINS", "").strip()
if cors_origins:
    origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
    CORS(app, resources={r"/*": {"origins": origins}})
else:
    # Default: no CORS headers in production unless explicitly configured
    CORS(app, resources={r"/*": {"origins": []}})


# Rate limiter using token/IP keying
limiter = Limiter(key_func=rate_limit_key, app=app, default_limits=["1000/day"])


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/metrics", methods=["GET"])
def metrics():
    return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}


@limiter.limit("10/minute")
@app.route("/audit/previous-token-usage", methods=["GET"])
def audit_previous_token_usage():
    ok, reason = authenticate_service_request()
    if not ok:
        return jsonify({"error": "unauthorized", "reason": reason}), 401

    log_path = os.path.join(LOG_DIR, "route_optimizer.log")
    summary = {"count": 0, "entries": []}
    max_entries = int(request.args.get("limit", 50))

    if not os.path.exists(log_path):
        return jsonify(summary)

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in reversed(f.readlines()):
                if "previous_token_used" in line:
                    idx = line.find("{")
                    if idx != -1:
                        maybe = line[idx:]
                        try:
                            obj = json.loads(maybe)
                        except Exception:
                            obj = {"raw": maybe}
                    else:
                        obj = {"raw": line}

                    summary["entries"].append(obj)
                    summary["count"] += 1
                    if len(summary["entries"]) >= max_entries:
                        break
    except Exception:
        logger.exception("failed to read audit log")

    return jsonify(summary)


@limiter.limit("30/minute")
@app.route("/optimize", methods=["POST"])
def optimize():
    REQ_COUNTER.inc()
    with REQ_DURATION.time():
        ok, reason = authenticate_service_request()
        if not ok:
            logger.info(json.dumps({"event": "auth_failed", "reason": reason, "trace_id": request.headers.get("X-Trace-Id")}))
            return jsonify({"error": "unauthorized", "reason": reason}), 401

        payload = request.get_json(force=True) or {}
        trace_id = request.headers.get("X-Trace-Id") or (datetime.utcnow().isoformat() + "Z")

        locations_raw = payload.get("locations") or []
        locations, warnings = enforce_rules(payload)
        start_index = int(payload.get("start_index", 0))
        preferences = payload.get("preferences") or {}

        if not locations:
            logger.info(json.dumps({"trace_id": trace_id, "event": "bad_request", "reason": "no locations"}))
            return jsonify({"error": "no locations provided"}), 400

        if start_index < 0 or start_index >= len(locations):
            warnings.append("start_index_clamped")
            start_index = 0

        matrix = compute_euclidean_matrix(locations, preferences=preferences)
        route_indices = solve_tsp_distance_matrix(
            matrix,
            start_index=start_index,
            preferences=preferences,
        )
        ordered = [locations[i] for i in route_indices]

        score = score_route(ordered)

        approx_distance = 0
        if len(route_indices) > 1:
            approx_distance = sum(
                matrix[route_indices[i]][route_indices[i + 1]]
                for i in range(len(route_indices) - 1)
            )

        max_duration = preferences.get("max_duration_minutes")
        if isinstance(max_duration, (int, float)) and max_duration > 0:
            max_total_distance = int(max_duration * 100000)
            if approx_distance > max_total_distance:
                warnings.append("max_duration_exceeded")

        response = {
            "route": ordered,
            "metrics": {
                "locations_count": len(locations),
                "approx_distance_units": approx_distance,
            },
            "score": score,
            "warnings": warnings,
            "solver_version": "ortools-9.6",
            "model_version": score.get("model_version"),
            "trace_id": trace_id,
        }

        logger.info(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "event": "optimize",
                    "request_count": len(locations_raw),
                    "final_count": len(locations),
                    "response_metrics": response["metrics"],
                    "warnings": warnings,
                }
            )
        )

        return jsonify(response)


@limiter.limit("100/day")
@app.route("/decision", methods=["POST"])
def decision():
    body = request.get_json(force=True) or {}
    ok, reason = authenticate_service_request()
    if not ok:
        logger.info(json.dumps({"event": "auth_failed", "reason": reason, "trace_id": request.headers.get("X-Trace-Id")}))
        return jsonify({"error": "unauthorized", "reason": reason}), 401
    trace_id = request.headers.get("X-Trace-Id") or (datetime.utcnow().isoformat() + "Z")
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "trace_id": trace_id,
        "action": body.get("action"),
    }
    try:
        logger.info(json.dumps({"trace_id": trace_id, "event": "decision_recorded", "entry": entry}))
    except Exception:
        logger.exception("failed to log decision entry")

    DECISIONS_COUNTER.inc()
    logger.info(json.dumps({"trace_id": trace_id, "event": "decision", "action": body.get("action")}))
    return jsonify({"status": "ok", "trace_id": trace_id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
