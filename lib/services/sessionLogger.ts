/**
 * Session Logger — Structured Observability
 *
 * Provides a typed wrapper around the existing logger that ensures all
 * session-related events carry the mandatory fields: session_id, rider_id.
 * This makes all session events queryable and traceable from a single key.
 */

import type { logger } from "@/lib/logger";

export type SessionEventType =
  | "session_started"
  | "session_ended"
  | "session_paused"
  | "session_resumed"
  | "session_auto_closed"
  | "gps_batch_received"
  | "gps_gap_detected"
  | "zone_entered"
  | "zone_exited"
  | "compliance_change"
  | "reward_calculated"
  | "reward_cap_reached"
  | "reward_session_ineligible"
  | "anomaly_detected"
  | "flag_raised"
  | "batch_upload_failed"
  | "batch_upload_retrying";

/**
 * Log a session-scoped event with mandatory tracing fields.
 * All session events are structured with session_id and rider_id at the top
 * level for log aggregation / filtering.
 */
export function logSessionEvent(
  log: typeof logger,
  event: SessionEventType,
  sessionId: string,
  riderId: string,
  metadata: Record<string, unknown> = {},
  level: "info" | "warn" | "error" | "debug" = "info",
): void {
  const payload = {
    session_id: sessionId,
    rider_id: riderId,
    event,
    ts: new Date().toISOString(),
    ...metadata,
  };

  switch (level) {
    case "debug":
      log.debug(`[session] ${event}`, payload);
      break;
    case "warn":
      log.warn(`[session] ${event}`, payload);
      break;
    case "error":
      log.error(`[session] ${event}`, new Error(event), payload);
      break;
    default:
      log.info(`[session] ${event}`, payload);
  }
}

// Re-export the type so callers don't need two imports
export type { logger as Logger };
