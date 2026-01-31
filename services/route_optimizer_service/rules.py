"""Lightweight rules engine for the prototype route optimizer.

This module enforces hard constraints and performs simple transformations needed
before passing locations to the solver. Keep rules deterministic and auditable.
"""
from typing import Dict, List, Tuple, Any


def enforce_rules(payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Apply hard business rules to locations.

    Returns (locations, warnings)
    - Ensures lat/lng present and numeric
    - Enforces max_duration (if provided) by adding a warning (solver must respect separately)
    - Removes exact-duplicate coordinates
    """
    locations = payload.get("locations") or []
    preferences = payload.get("preferences", {}) or {}
    max_duration = preferences.get("max_duration_minutes")
    include_rest_stops = bool(preferences.get("include_rest_stops"))
    seen = set()
    out: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for loc in locations:
        try:
            lat = float(loc.get("lat"))
            lng = float(loc.get("lng"))
        except Exception:
            warnings.append(f"invalid coordinates for stop {loc.get('id')}")
            continue

        key = (round(lat, 6), round(lng, 6))
        if key in seen:
            warnings.append(f"duplicate stop removed: {loc.get('id')}")
            continue
        seen.add(key)
        normalized = {**loc, "lat": lat, "lng": lng}
        out.append(normalized)

    if max_duration is not None:
        warnings.append(f"max_duration_minutes constraint: {max_duration}")

    # Insert a deterministic rest stop if requested and there are enough points.
    if include_rest_stops and len(out) >= 3:
        latitudes = [p["lat"] for p in out]
        longitudes = [p["lng"] for p in out]
        rest_lat = (min(latitudes) + max(latitudes)) / 2.0
        rest_lng = (min(longitudes) + max(longitudes)) / 2.0
        rest_key = (round(rest_lat, 6), round(rest_lng, 6))
        if rest_key not in seen:
            rest_stop = {"id": "REST_STOP", "lat": rest_lat, "lng": rest_lng}
            out.append(rest_stop)
            warnings.append("rest_stop_inserted")

    # Validate optional edge-penalty matrix dimensions (if provided)
    edge_penalties = preferences.get("edge_penalties")
    if edge_penalties is not None:
        if not isinstance(edge_penalties, list):
            warnings.append("edge_penalties invalid: expected list of lists")
        else:
            size = len(out)
            valid = True
            if size == 0:
                valid = False
            for row in edge_penalties:
                if not isinstance(row, list) or len(row) != size:
                    valid = False
                    break
            if not valid:
                warnings.append("edge_penalties invalid: shape mismatch")

    # Record additional preferences to confirm receipt (solver enforces via heuristics)
    for key in [
        "avoid_traffic",
        "include_rest_stops",
        "weather_consideration",
        "time_of_day",
        "priority",
    ]:
        if key in preferences:
            warnings.append(f"preference received: {key}={preferences.get(key)}")

    return out, warnings
