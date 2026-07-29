import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";

export type QueueHealthBucket =
  | "processing"
  | "ready"
  | "awaiting_collection"
  | "failed"
  | "refunded";

const BUCKET_STATES: Record<QueueHealthBucket, readonly FulfilmentState[]> = {
  processing: ["created", "reserved", "processing"],
  ready: ["ready", "dispatched", "delivered", "validated"],
  awaiting_collection: ["awaiting_collection"],
  failed: ["failed", "expired", "cancelled"],
  refunded: ["refunded", "reversed"],
};

export function countByQueueHealth(
  rows: FulfilmentReadModel[] | undefined,
): Record<QueueHealthBucket, number> {
  const counts: Record<QueueHealthBucket, number> = {
    processing: 0,
    ready: 0,
    awaiting_collection: 0,
    failed: 0,
    refunded: 0,
  };
  if (!rows?.length) return counts;

  for (const row of rows) {
    for (const bucket of Object.keys(BUCKET_STATES) as QueueHealthBucket[]) {
      if (BUCKET_STATES[bucket].includes(row.state)) {
        counts[bucket] += 1;
        break;
      }
    }
  }
  return counts;
}

export function deriveOpsHealth(rows: FulfilmentReadModel[] | undefined) {
  const total = rows?.length ?? 0;
  const completed =
    rows?.filter((row) => row.state === "completed" || row.state === "collected")
      .length ?? 0;
  const failed =
    rows?.filter((row) => row.state === "failed" || row.state === "expired")
      .length ?? 0;
  const refunded =
    rows?.filter((row) => row.state === "refunded" || row.state === "reversed")
      .length ?? 0;
  const inFlight =
    rows?.filter(
      (row) =>
        row.state !== "completed" &&
        row.state !== "cancelled" &&
        row.state !== "refunded" &&
        row.state !== "reversed" &&
        row.state !== "expired" &&
        row.state !== "failed",
    ).length ?? 0;

  return {
    total,
    completed,
    failed,
    refunded,
    inFlight,
    successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
    refundRate: total > 0 ? Math.round((refunded / total) * 100) : 0,
  };
}
