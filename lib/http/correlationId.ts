import { randomUUID } from "node:crypto";

/**
 * Propagate an incoming correlation id when present; otherwise create one.
 */
export function getOrCreateCorrelationId(
  incomingHeader?: string | null,
): string {
  const trimmed = incomingHeader?.trim();
  if (trimmed) {
    return trimmed;
  }
  return randomUUID();
}
