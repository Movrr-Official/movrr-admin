# Route Optimizer Prototype Service

This small prototype exposes a minimal HTTP service that uses OR-Tools to solve a tiny TSP/route problem.

Run locally (development):

```bash
python -m venv .venv
.venv/bin/activate        # on macOS / Linux
# on Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Run in production (Docker):

```bash
docker build -t movrr-route-optimizer:latest .
docker run --rm -p 5000:5000 -e ROUTE_LOG_DIR=/app/logs movrr-route-optimizer:latest
```

Useful endpoints:

- `GET /health` — service health
- `GET /metrics` — Prometheus metrics
- `POST /optimize` — run optimizer
- `POST /decision` — record accept/reject decisions

POST `/optimize` expects JSON with `locations` (array of {id,lat,lng}) and optional `start_index`.
POST `/decision` accepts a decision body and records it to the service log as structured JSON (searchable via `previous_token_used` and other event keys).

## Secrets & token rotation

This service uses a shared service token to authenticate internal proxy requests. Recommended setup:

- Set `ROUTE_OPTIMIZER_TOKEN` (or `ROUTE_OPTIMIZER_KEY`) as an environment variable in CI, staging and production. Do NOT commit this value.
- The Next.js server-side proxy (`/api/optimize/...`) injects the token when forwarding requests to the optimizer service; client-side code should never contain the token.
- Keep the Flask service reachable only from trusted network locations (cluster internal, VPC) if possible; the token is a second layer of defense.
- Rotate the token periodically (every 30–90 days) or immediately on suspicion of leakage:
  1.  Generate a new token and store it in your secrets manager.
  2.  Deploy the Next.js app with the new token in its environment (CI secret update).
  3.  Deploy the Next.js app with the new token in its environment (CI secret update). The proxy supports a dual-token window where it will accept both the current and previous token — set `ROUTE_OPTIMIZER_PREV_TOKEN` to the old token while the new token is live.
  4.  Deploy the optimizer service with the new token or update service env. Optionally enable `ROUTE_ALLOW_PREV_TOKEN=true` on the optimizer if you expect direct callers to still use the old token during the rollout (this is opt-in and should only be used briefly).
  5.  Monitor logs for `previous_token_used` events (the optimizer logs any use of the previous token).
  6.  Revoke the old token and unset `ROUTE_OPTIMIZER_PREV_TOKEN` once all clients are updated.

### Example rotation commands (Docker)

```bash
# generate tokens (example using openssl)
export OLD_TOKEN="$ROUTE_OPTIMIZER_TOKEN"
export NEW_TOKEN=$(openssl rand -hex 24)

# update Next.js environment: set ROUTE_OPTIMIZER_PREV_TOKEN=$OLD_TOKEN and ROUTE_OPTIMIZER_TOKEN=$NEW_TOKEN in your secrets manager
# deploy Next.js (so the proxy will send the new token)

# update optimizer service environment: set ROUTE_OPTIMIZER_TOKEN=$NEW_TOKEN and optionally ROUTE_ALLOW_PREV_TOKEN=true while rolling
docker run --rm -p 5000:5000 -e ROUTE_LOG_DIR=/app/logs -e ROUTE_OPTIMIZER_TOKEN="$NEW_TOKEN" -e ROUTE_ALLOW_PREV_TOKEN=true movrr-route-optimizer:latest

# monitor logs (in another shell)
tail -f logs/route_optimizer.log | grep previous_token_used

# after a monitoring window, remove the previous token and disable ROUTE_ALLOW_PREV_TOKEN
```

## Secrets management

- Use your cloud provider / GitHub Secrets / Vault to store `ROUTE_OPTIMIZER_TOKEN` and avoid plaintext config files.
- For local development, use a `.env` file loaded by `python-dotenv` or pass environment variables explicitly when running the container.
