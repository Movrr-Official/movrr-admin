import logging
import logging.handlers
import os
import sys

LOG_DIR = os.environ.get("ROUTE_LOG_DIR", ".")
os.makedirs(LOG_DIR, exist_ok=True)

logger = logging.getLogger("route_optimizer")
logger.setLevel(logging.INFO)

# Rotating file handler (fallback for local file captures)
fh = logging.handlers.RotatingFileHandler(
    os.path.join(LOG_DIR, "route_optimizer.log"), maxBytes=10_000_000, backupCount=5, encoding="utf-8"
)
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
fh.setFormatter(formatter)

# Console handler for container stdout (preferred for orchestration)
ch = logging.StreamHandler(stream=sys.stdout)
ch.setFormatter(formatter)

if not logger.handlers:
    logger.addHandler(ch)
    logger.addHandler(fh)
