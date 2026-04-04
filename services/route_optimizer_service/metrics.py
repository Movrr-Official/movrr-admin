from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQ_COUNTER = Counter("route_opt_requests_total", "Total optimize requests")
REQ_DURATION = Histogram(
    "route_opt_request_duration_seconds", "Total wall-clock duration of optimize requests"
)
SOLVER_DURATION = Histogram(
    "route_opt_solver_duration_seconds",
    "Wall-clock time spent inside the OR-Tools solver only",
)

__all__ = [
    "REQ_COUNTER",
    "REQ_DURATION",
    "SOLVER_DURATION",
    "generate_latest",
    "CONTENT_TYPE_LATEST",
]
