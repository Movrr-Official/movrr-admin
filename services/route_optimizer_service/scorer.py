"""Simple deterministic scorer placeholder for impressions / cost estimates.

This is a lightweight, auditable function used as a scaffold for later ML models.
"""
from typing import Dict, Any, List


def score_route(locations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return a small scoring object for a candidate route.

    Currently uses simple heuristics:
    - impressions_estimate = 100 * sqrt(n_stops)
    - cost_estimate = n_stops * 1.0
    - confidence: low for heuristic
    """
    n = max(0, len(locations))
    impressions = int(100 * (n ** 0.5))
    cost = float(n) * 1.0
    return {
        "impressions_estimate": impressions,
        "cost_estimate": cost,
        "confidence": 0.25,
        "model_version": "heuristic-v0",
    }
