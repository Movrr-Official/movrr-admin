/**
 * In-memory metrics sink for fulfilment outcome counters (Phase 1).
 */
export type FulfilmentMetricsSink = {
  increment: (metric: string) => void;
  getCount: (metric: string) => number;
};
