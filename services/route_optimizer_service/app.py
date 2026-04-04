"""Route optimizer service.

Minimal runtime entrypoint that composes helpers and exposes required
endpoints. Keep other logic in sibling modules (logging_setup.py,
auth.py, solver.py, rules.py, scorer.py, metrics.py).
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import time
from datetime import datetime

from logging_setup import logger, LOG_DIR
from metrics import (
    REQ_COUNTER,
    REQ_DURATION,
    SOLVER_DURATION,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
from auth import rate_limit_key, authenticate_service_request
from solver import compute_distance_matrix, solve_tsp_distance_matrix
from rules import enforce_rules, MAX_LOCATIONS
from scorer import score_route

from flask_limiter import Limiter


app = Flask(__name__)

cors_origins = os.environ.get("ROUTE_CORS_ORIGINS", "").strip()
if cors_origins:
    origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
    CORS(app, resources={r"/*": {"origins": origins}})
else:
    # Default: no CORS headers in production unless explicitly configured.
    CORS(app, resources={r"/*": {"origins": []}})


limiter = Limiter(key_func=rate_limit_key, app=app, default_limits=["1000/day"])


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/metrics", methods=["GET"])
def metrics():
    # Restrict to authenticated service callers so counter values are not
    # world-readable. The /health endpoint remains unauthenticated for
    # infra health-check probes.
    ok, reason = authenticate_service_request()
    if not ok:
        return jsonify({"error": "unauthorized", "reason": reason}), 401
    return generate_latest(), 200, {"Content-Type": CONTENT_TYPE_LATEST}


@limiter.limit("10/minute")
@app.route("/audit/previous-token-usage", methods=["GET"])
def audit_previous_token_usage():
    ok, reason = authenticate_service_request()
    if not ok:
        return jsonify({"error": "unauthorized", "reason": reason}), 401

    log_path = os.path.join(LOG_DIR, "route_optimizer.log")
    summary = {"count": 0, "entries": []}
    max_entries = min(int(request.args.get("limit", 50)), 200)

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
    request_started_at = time.monotonic()

    with REQ_DURATION.time():
        ok, reason = authenticate_service_request()
        if not ok:
            logger.info(json.dumps({
                "event": "auth_failed",
                "reason": reason,
                "trace_id": request.headers.get("X-Trace-Id"),
            }))
            return jsonify({"error": "unauthorized", "reason": reason}), 401

        payload = request.get_json(force=True) or {}
        trace_id = request.headers.get("X-Trace-Id") or (datetime.utcnow().isoformat() + "Z")

        # Hard input-size limit (defence in depth; proxy enforces 80).
        locations_raw = payload.get("locations") or []
        if len(locations_raw) > MAX_LOCATIONS:
            logger.info(json.dumps({
                "trace_id": trace_id,
                "event": "bad_request",
                "reason": f"too_many_locations:{len(locations_raw)}",
            }))
            return jsonify({
                "error": "too_many_locations",
                "max": MAX_LOCATIONS,
                "received": len(locations_raw),
            }), 400

        locations, warnings = enforce_rules(payload)
        start_index = int(payload.get("start_index", 0))
        preferences = payload.get("preferences") or {}

        if not locations:
            logger.info(json.dumps({"trace_id": trace_id, "event": "bad_request", "reason": "no locations"}))
            return jsonify({"error": "no locations provided"}), 400

        if start_index < 0 or start_index >= len(locations):
            warnings.append("start_index_clamped")
            start_index = 0

        matrix = compute_distance_matrix(locations, preferences=preferences)

        # --- Solver ---------------------------------------------------------
        solver_t0 = time.monotonic()
        route_indices, solver_status = solve_tsp_distance_matrix(
            matrix,
            start_index=start_index,
            preferences=preferences,
        )
        solver_elapsed_s = time.monotonic() - solver_t0
        SOLVER_DURATION.observe(solver_elapsed_s)
        # --------------------------------------------------------------------

        if solver_status != "solved":
            warnings.append("solver_fallback: route is unoptimized (returned in input order)")

        ordered = [locations[i] for i in route_indices]

        # Total route distance in real metres (sum of consecutive haversine legs).
        distance_meters = 0
        if len(route_indices) > 1:
            distance_meters = sum(
                matrix[route_indices[i]][route_indices[i + 1]]
                for i in range(len(route_indices) - 1)
            )
        distance_km = round(distance_meters / 1000.0, 3)

        score = score_route(ordered, distance_meters=distance_meters)

        # Duration feasibility check using real units.
        max_duration = preferences.get("max_duration_minutes")
        if isinstance(max_duration, (int, float)) and max_duration > 0:
            # 15 km/h average = 250 m/min
            max_distance_for_duration = max_duration * 250.0
            if distance_meters > max_distance_for_duration:
                warnings.append("max_duration_exceeded")

        total_elapsed_s = time.monotonic() - request_started_at

        response = {
            "route": ordered,
            "metrics": {
                "locations_count": len(locations),
                "distance_meters": distance_meters,
                "distance_km": distance_km,
            },
            "score": score,
            "solver_status": solver_status,
            "solver_time_seconds": round(solver_elapsed_s, 3),
            "solver_time_limit_applied": True,
            "warnings": warnings,
            "solver_version": "ortools-9.6",
            "trace_id": trace_id,
        }

        logger.info(json.dumps({
            "trace_id": trace_id,
            "event": "optimize",
            "solver_status": solver_status,
            "solver_time_s": round(solver_elapsed_s, 3),
            "total_time_s": round(total_elapsed_s, 3),
            "request_count": len(locations_raw),
            "final_count": len(locations),
            "distance_meters": distance_meters,
            "warnings": warnings,
        }))

        return jsonify(response)


# The /decision endpoint has been intentionally removed.
# Decision persistence is the sole responsibility of the Next.js proxy layer
# (app/api/optimize/decision/route.ts -> route_optimizer_decisions table).
# Keeping a second log path here created a duplicate audit trail with no
# additional data. Any existing calls to this path will receive 410 Gone.
@app.route("/decision", methods=["POST"])
def decision_removed():
    return jsonify({
        "error": "gone",
        "message": "Decision persistence is handled by the admin proxy. This endpoint has been removed.",
    }), 410


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
