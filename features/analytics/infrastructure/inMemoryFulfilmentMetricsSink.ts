import type { FulfilmentMetricsSink } from "@/features/analytics/application/contracts/FulfilmentMetricsSink";

/** In-memory fulfilment metrics counters for unit tests / Phase-1 composition. */
export function createInMemoryFulfilmentMetricsSink(): FulfilmentMetricsSink {
  const counts = new Map<string, number>();

  return {
    increment(metric: string): void {
      counts.set(metric, (counts.get(metric) ?? 0) + 1);
    },

    getCount(metric: string): number {
      return counts.get(metric) ?? 0;
    },
  };
}
