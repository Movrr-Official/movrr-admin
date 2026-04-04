"""TSP solver using OR-Tools.

All distances are in metres (haversine). The solver returns a
(route_indices, solver_status) tuple so callers can distinguish a real
solution from the input-order fallback.
"""
import math
import time
import logging

try:
    from ortools.constraint_solver import pywrapcp
    from ortools.constraint_solver import routing_enums_pb2
except Exception:
    raise

logger = logging.getLogger("route_optimizer")

# Default solver wall-clock budget in seconds (applied when the caller does
# not supply solver_time_limit_seconds).
DEFAULT_SOLVER_TIME_LIMIT_SECONDS = 5

# Assumed average cycling speed used to convert max_duration_minutes to
# max_distance_meters for the OR-Tools Distance dimension constraint.
DEFAULT_AVG_SPEED_KMH = 15.0
_AVG_SPEED_MPS = DEFAULT_AVG_SPEED_KMH * 1000.0 / 3600.0  # ~4.167 m/s


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """Great-circle distance in whole metres (WGS-84 sphere approximation)."""
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return int(2 * R * math.asin(math.sqrt(max(0.0, min(1.0, a)))))


def compute_distance_matrix(locations, preferences=None):
    """Build an N*N haversine distance matrix (values in metres).

    Replaces the old Euclidean approach which was systematically wrong at
    non-equatorial latitudes.
    """
    coords = [(float(loc["lat"]), float(loc["lng"])) for loc in locations]
    size = len(coords)
    matrix = [[0] * size for _ in range(size)]
    for i in range(size):
        for j in range(size):
            if i != j:
                matrix[i][j] = haversine_meters(
                    coords[i][0], coords[i][1], coords[j][0], coords[j][1]
                )
    return apply_preferences_to_matrix(matrix, preferences or {})


def compute_euclidean_matrix(locations, preferences=None):
    """Deprecated alias -- delegates to the haversine implementation."""
    return compute_distance_matrix(locations, preferences)


def apply_preferences_to_matrix(distance_matrix, preferences):
    """Scale matrix cells by preference-derived multipliers.

    The matrix is in metres; multipliers are dimensionless so the output
    remains in metres.
    """
    if not distance_matrix:
        return distance_matrix

    flat = [v for row in distance_matrix for v in row if v]
    max_distance = max(flat) if flat else 0
    if max_distance == 0:
        return distance_matrix

    avoid_traffic = bool(preferences.get("avoid_traffic"))
    weather = bool(preferences.get("weather_consideration"))
    time_of_day = preferences.get("time_of_day") or ""
    priority = preferences.get("priority") or ""
    edge_penalties = preferences.get("edge_penalties")

    peak_multiplier = 1.0
    if time_of_day in ("peak", "evening"):
        peak_multiplier = 1.15
    elif time_of_day == "midday":
        peak_multiplier = 1.05

    penalty_strength = 0.0
    if avoid_traffic:
        penalty_strength += 0.15
    if weather:
        penalty_strength += 0.1
    if priority in ("duration", "efficiency"):
        penalty_strength += 0.1
    elif priority == "coverage":
        penalty_strength = max(0.0, penalty_strength - 0.05)

    adjusted = []
    for row in distance_matrix:
        new_row = []
        for dist in row:
            if dist == 0:
                new_row.append(0)
                continue
            ratio = dist / max_distance
            multiplier = (1.0 + penalty_strength * ratio) * peak_multiplier
            new_row.append(int(dist * multiplier))
        adjusted.append(new_row)

    if isinstance(edge_penalties, list):
        size = len(adjusted)
        if size > 0 and all(
            isinstance(r, list) and len(r) == size for r in edge_penalties
        ):
            penalized = []
            for i in range(size):
                row = []
                for j in range(size):
                    base = adjusted[i][j]
                    if base == 0:
                        row.append(0)
                        continue
                    try:
                        factor_value = float(edge_penalties[i][j])
                    except Exception:
                        factor_value = 1.0
                    if factor_value <= 0:
                        factor_value = 1.0
                    row.append(int(base * factor_value))
                penalized.append(row)
            return penalized

    return adjusted


def solve_tsp_distance_matrix(distance_matrix, start_index=0, preferences=None):
    """Solve the TSP and return (route_indices, solver_status).

    solver_status values:
      "solved"   -- OR-Tools found and GLS-improved a solution within the limit.
      "fallback" -- OR-Tools found no solution; input order returned.
      "failed"   -- An unexpected exception occurred; input order returned.

    The distance_matrix must be in metres (integers). max_duration_minutes is
    converted to a metre cap using DEFAULT_AVG_SPEED_KMH so the OR-Tools
    Distance dimension constraint is dimensionally correct.
    """
    size = len(distance_matrix)
    if size == 0:
        return [], "solved"

    preferences = preferences or {}
    priority = preferences.get("priority") or ""

    # Time limit: caller value or module default -- always applied.
    time_limit_seconds = preferences.get("solver_time_limit_seconds")
    if not isinstance(time_limit_seconds, (int, float)) or time_limit_seconds <= 0:
        time_limit_seconds = DEFAULT_SOLVER_TIME_LIMIT_SECONDS

    # max_duration -> metre cap using average cycling speed (not arbitrary units).
    max_duration_minutes = preferences.get("max_duration_minutes")
    max_distance_meters = None
    if isinstance(max_duration_minutes, (int, float)) and max_duration_minutes > 0:
        max_distance_meters = int(max_duration_minutes * 60.0 * _AVG_SPEED_MPS)

    try:
        manager = pywrapcp.RoutingIndexManager(size, 1, start_index)
        routing = pywrapcp.RoutingModel(manager)

        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return distance_matrix[from_node][to_node]

        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        # Distance dimension for max_duration enforcement (now in real metres).
        if max_distance_meters is not None:
            routing.AddDimension(
                transit_callback_index,
                0,
                max_distance_meters,
                True,
                "Distance",
            )

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()

        # First-solution strategy: coverage uses insertion for geographic spread.
        if priority == "coverage":
            search_parameters.first_solution_strategy = (
                routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
            )
        else:
            search_parameters.first_solution_strategy = (
                routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            )

        # Always apply GUIDED_LOCAL_SEARCH to improve past the greedy solution.
        # The time limit bounds how long improvement runs.
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.FromSeconds(int(time_limit_seconds))

        t0 = time.monotonic()
        solution = routing.SolveWithParameters(search_parameters)
        elapsed = time.monotonic() - t0

        if solution:
            index = routing.Start(0)
            route = []
            while not routing.IsEnd(index):
                route.append(manager.IndexToNode(index))
                index = solution.Value(routing.NextVar(index))
            route.append(manager.IndexToNode(index))
            logger.info(
                '{"event":"solver_outcome","status":"solved","elapsed_s":%.3f,'
                '"size":%d,"priority":"%s","time_limit_s":%d}',
                elapsed, size, priority, int(time_limit_seconds),
            )
            return route, "solved"

        # No solution found within time/distance constraints.
        logger.warning(
            '{"event":"solver_outcome","status":"fallback","elapsed_s":%.3f,'
            '"size":%d,"priority":"%s"}',
            elapsed, size, priority,
        )
        return list(range(size)), "fallback"

    except Exception:
        logger.exception(
            '{"event":"solver_outcome","status":"failed","size":%d}', size
        )
        return list(range(size)), "failed"


__all__ = [
    "compute_distance_matrix",
    "compute_euclidean_matrix",
    "apply_preferences_to_matrix",
    "solve_tsp_distance_matrix",
    "haversine_meters",
    "DEFAULT_SOLVER_TIME_LIMIT_SECONDS",
    "DEFAULT_AVG_SPEED_KMH",
]
