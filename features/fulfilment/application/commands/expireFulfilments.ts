import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
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

export type ExpireFulfilmentsDeps = {
  engine: Pick<FulfilmentEngine, "list" | "expire">;
  now?: Date;
};

export type ExpireFulfilmentsResult = {
  expired: number;
  skipped: number;
};

function isPastExpiry(fulfilment: Fulfilment, now: Date): boolean {
  if (!fulfilment.expiresAt) return false;
  return new Date(fulfilment.expiresAt).getTime() <= now.getTime();
}

/**
 * Platform job: expire fulfilments past expires_at via FulfilmentEngine / SM.
 * Never assigns fulfilment.state directly. Safe to run repeatedly.
 */
export async function expireFulfilments(
  deps: ExpireFulfilmentsDeps,
): Promise<ExpireFulfilmentsResult> {
  const now = deps.now ?? new Date();
  const rows = await deps.engine.list();
  let expired = 0;
  let skipped = 0;

  for (const fulfilment of rows) {
    if (TERMINAL_STATES.has(fulfilment.state)) {
      skipped += 1;
      continue;
    }
    if (!isPastExpiry(fulfilment, now)) {
      skipped += 1;
      continue;
    }

    const result = await deps.engine.expire(
      fulfilment.id,
      "scheduled_expiry",
    );
    if (result.ok && result.value.fulfilment.state === "expired") {
      expired += 1;
    } else {
      skipped += 1;
    }
  }

  return { expired, skipped };
}
