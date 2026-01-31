import os
import json
from datetime import datetime, UTC
from flask import request
from logging_setup import logger


def rate_limit_key():
    """Prefer token-based keys when available, otherwise use remote IP."""
    try:
        auth = None
        if request:
            auth = request.headers.get("authorization") or request.headers.get("x-route-token")
    except Exception:
        auth = None

    if auth:
        token = auth[7:] if auth.startswith("Bearer ") else auth
        return f"token:{token}"

    ip = request.headers.get("x-forwarded-for") or request.remote_addr or "unknown"
    return f"ip:{ip}"


def authenticate_service_request():
    """Validate service-to-service token if configured.

    Returns (ok: bool, reason: str)
    """
    current = os.environ.get("ROUTE_OPTIMIZER_TOKEN") or os.environ.get("ROUTE_OPTIMIZER_KEY")
    previous = os.environ.get("ROUTE_OPTIMIZER_PREV_TOKEN") or os.environ.get("ROUTE_OPTIMIZER_OLD_TOKEN")
    allow_prev = str(os.environ.get("ROUTE_ALLOW_PREV_TOKEN", "false")).lower() in ("1", "true", "yes")

    auth = request.headers.get("authorization") or request.headers.get("x-route-token") or ""
    token = auth[7:] if auth.startswith("Bearer ") else auth

    if not current and not previous:
        logger.warning("no optimizer service token configured; denying request")
        return False, "no_token_configured"

    if not token:
        return False, "missing_token"

    if current and token == current:
        return True, "current_token"

    if allow_prev and previous and token == previous:
        # Audit usage of the previous token
        try:
            logger.warning(json.dumps({
                "event": "previous_token_used",
                "remote_addr": request.headers.get("x-forwarded-for") or request.remote_addr,
                "time": datetime.now(UTC).isoformat() + "Z",
            }))
        except Exception:
            logger.exception("failed to log previous-token usage")
        return True, "previous_token"

    return False, "invalid_token"

__all__ = ["rate_limit_key", "authenticate_service_request"]
