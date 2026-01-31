import math
try:
    from ortools.constraint_solver import pywrapcp
    from ortools.constraint_solver import routing_enums_pb2
except Exception:
    raise


def compute_euclidean_matrix(locations, preferences=None):
    coords = [(float(l["lat"]), float(l["lng"])) for l in locations]
    size = len(coords)
    matrix = [[0] * size for _ in range(size)]
    for i in range(size):
        for j in range(size):
            if i == j:
                matrix[i][j] = 0
            else:
                dx = coords[i][0] - coords[j][0]
                dy = coords[i][1] - coords[j][1]
                matrix[i][j] = int(math.hypot(dx, dy) * 100000)
    return apply_preferences_to_matrix(matrix, preferences or {})


def apply_preferences_to_matrix(distance_matrix, preferences):
    if not distance_matrix:
        return distance_matrix

    max_distance = max(max(row) for row in distance_matrix if row)
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

    # Priority affects how much we penalize longer legs.
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
            multiplier = 1.0 + (penalty_strength * ratio)
            multiplier *= peak_multiplier
            new_row.append(int(dist * multiplier))
        adjusted.append(new_row)

    # Apply optional edge-level penalties (matrix of multipliers)
    if isinstance(edge_penalties, list):
        size = len(adjusted)
        if size > 0 and all(isinstance(r, list) and len(r) == size for r in edge_penalties):
            penalized = []
            for i in range(size):
                row = []
                for j in range(size):
                    base = adjusted[i][j]
                    if base == 0:
                        row.append(0)
                        continue
                    factor = edge_penalties[i][j]
                    try:
                        factor_value = float(factor)
                    except Exception:
                        factor_value = 1.0
                    if factor_value <= 0:
                        factor_value = 1.0
                    row.append(int(base * factor_value))
                penalized.append(row)
            return penalized

    return adjusted


def solve_tsp_distance_matrix(distance_matrix, start_index=0, preferences=None):
    size = len(distance_matrix)
    if size == 0:
        return []

    manager = pywrapcp.RoutingIndexManager(size, 1, start_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    preferences = preferences or {}
    priority = preferences.get("priority")

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    strategy_map = {
        "impressions": routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
        "efficiency": routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
        "duration": routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC,
        "coverage": routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION,
    }
    search_parameters.first_solution_strategy = strategy_map.get(
        priority, routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )

    time_limit_seconds = preferences.get("solver_time_limit_seconds")
    if isinstance(time_limit_seconds, (int, float)) and time_limit_seconds > 0:
        search_parameters.time_limit.FromSeconds(int(time_limit_seconds))

    max_duration_minutes = preferences.get("max_duration_minutes")
    if isinstance(max_duration_minutes, (int, float)) and max_duration_minutes > 0:
        # Heuristic: constrain total distance in proportion to max_duration_minutes
        max_total_distance = int(max_duration_minutes * 100000)
        routing.AddDimension(
            transit_callback_index,
            0,
            max_total_distance,
            True,
            "Distance",
        )

    solution = routing.SolveWithParameters(search_parameters)
    if solution:
        index = routing.Start(0)
        route = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(node)
            index = solution.Value(routing.NextVar(index))
        node = manager.IndexToNode(index)
        route.append(node)
        return route
    # Fallback to input order if no solution found to avoid empty routes
    return list(range(size))

__all__ = ["compute_euclidean_matrix", "solve_tsp_distance_matrix", "apply_preferences_to_matrix"]
