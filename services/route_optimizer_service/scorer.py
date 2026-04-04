"""Heuristic route scorer.

Produces rough impression and cost estimates. All values are clearly marked
as heuristic estimates -- they are NOT the output of a trained model and must
not be presented as precise predictions.

The impression proxy is distance-based (per 100 m of route) rather than
purely stop-count-based, which is more physically meaningful: a longer route
through an urban area generates more ad exposure than the same number of stops
clustered in a small area.
"""
from typing import Dict, Any, List, Optional


# Impressions per 100 m of route distance (rough urban ad-exposure proxy).
_IMPRESSIONS_PER_100M = 8


def score_route(
    locations: List[Dict[str, Any]],
    distance_meters: Optional[int] = None,
) -> Dict[str, Any]:
    """Return a heuristic scoring object for a candidate route.

    Args:
        locations:       Ordered list of location dicts in the optimized route.
        distance_meters: Total haversine route distance in metres (preferred).
                         When None, falls back to a stop-count proxy.

    Returns a dict with:
      impressions_estimate  -- rough impression count proxy
      cost_estimate         -- route-length cost proxy (distance_km or n_stops)
      is_estimate           -- always True; signals downstream that this is not
                               a model prediction
      model_type            -- "heuristic" (not a trained model)
      confidence            -- null; heuristics do not carry calibrated confidence
    """
    n = max(0, len(locations))

    if distance_meters is not None and distance_meters > 0:
        # Distance-proportional estimate: more physically meaningful than sqrt(n).
        impressions = int((distance_meters / 100) * _IMPRESSIONS_PER_100M)
        cost_estimate = round(distance_meters / 1000.0, 3)  # cost in km
    else:
        # Fallback when distance is unavailable.
        impressions = int(100 * (n ** 0.5))
        cost_estimate = float(n)

    return {
        "impressions_estimate": impressions,
        "cost_estimate": cost_estimate,
        "is_estimate": True,
        "model_type": "heuristic",
        "confidence": None,
    }
