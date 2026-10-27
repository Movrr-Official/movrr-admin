# MOVRR independent operational watchdog

This production Cloudflare Worker calls only the Admin operational monitor endpoint once per minute. It never claims settlements, awards points, enrolls rides, or executes recovery. The dedicated `RIDE_SETTLEMENT_WATCHDOG_TOKEN` is a secret binding and must match the encrypted Admin production environment value. No financial or Supabase service credential is installed in Cloudflare.

Use the pinned Wrangler dependency with `npm ci` in this directory. Validate with `node node_modules/wrangler/bin/wrangler.js deploy --dry-run`, then deploy the reviewed commit with `node node_modules/wrangler/bin/wrangler.js deploy`. Provision the secret through Wrangler secure input. Public HTTP requests return 404; workers.dev and preview URLs are disabled.

Each run uses three bounded 15-second attempts. Failed checks throw a sanitized runtime exception for Cloudflare Observability. Successful checks persist a separate database watchdog heartbeat through a service-only RPC. Migration 103 adds watchdogMissing/watchdogFailed conditions to the existing Founder inbox incident pipeline. Supabase detects missing watchdog runs after three minutes; Cloudflare invokes the monitor independently of Supabase cron. Provider logs are operational evidence, not proof of inbox delivery when the Admin/database itself is unavailable.

Arm `ride_ops_control.watchdog_expected` with a current `watchdog_armed_at` only after actual scheduled success is observed. Never backdate production heartbeat or test evidence. To disable intentionally, clear watchdog_expected before removing its cron trigger. Keep financial activation separate. Use the pinned Founder account and actual AAL2 acknowledgement for incidents; never impersonate a human actor.
