import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";

const TERMINAL_STATES = new Set<FulfilmentState>([
  "completed",
  "cancelled",
  "failed",
  "expired",
  "refunded",
  "reversed",
]);

/** States that may still hold a resource reservation. */
const RESERVATION_STATES = new Set<FulfilmentState>([
  "reserved",
  "ready",
  "awaiting_collection",
]);

export type ReleaseStaleReservationsDeps = {
  engine: Pick<FulfilmentEngine, "list" | "get" | "cancel">;
  /** Explicit candidates (tests / ops). When omitted, scans engine.list(). */
  candidateIds?: string[];
  now?: Date;
};

export type ReleaseStaleReservationsResult = {
  released: number;
};

/**
 * Platform job: release stale resource reservations via engine.cancel → handler → SM.
 * Never updates fulfilment.state in SQL/persistence directly.
 */
export async function releaseStaleReservations(
  deps: ReleaseStaleReservationsDeps,
): Promise<ReleaseStaleReservationsResult> {
  const now = deps.now ?? new Date();
  const ids =
    deps.candidateIds ??
    (await deps.engine.list())
      .filter((f) => {
        if (!RESERVATION_STATES.has(f.state)) return false;
        if (!f.expiresAt) return false;
        return new Date(f.expiresAt).getTime() <= now.getTime();
      })
      .map((f) => f.id);

  let released = 0;

  for (const id of ids) {
    const loaded = await deps.engine.get(id);
    if (!loaded.ok) continue;
    if (TERMINAL_STATES.has(loaded.value.state)) continue;

    const result = await deps.engine.cancel(
      id,
      "stale_reservation_release",
    );
    if (result.ok) {
      released += 1;
    }
  }

  return { released };
}
