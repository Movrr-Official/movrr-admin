from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQ_COUNTER = Counter("route_opt_requests_total", "Total optimize requests")
REQ_DURATION = Histogram(
    "route_opt_request_duration_seconds", "Duration of optimize requests"
)
DECISIONS_COUNTER = Counter("route_opt_decisions_total", "Total decisions recorded")

__all__ = [
    "REQ_COUNTER",
    "REQ_DURATION",
    "DECISIONS_COUNTER",
    "generate_latest",
    "CONTENT_TYPE_LATEST",
]
