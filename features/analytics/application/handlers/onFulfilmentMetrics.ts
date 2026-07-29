import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { FulfilmentMetricsSink } from "@/features/analytics/application/contracts/FulfilmentMetricsSink";

const EVENT_TO_METRIC: Record<string, string> = {
  FulfilmentCompleted: "redemption_completed",
  FulfilmentExpired: "expired",
  FulfilmentCancelled: "cancelled",
  FulfilmentFailed: "failed",
  FulfilmentRefunded: "refunded",
};

/**
 * Reactive analytics sink for fulfilment outcome events.
 * Consumers only — never mutate fulfilment aggregates.
 */
export function registerFulfilmentMetricsHandlers(
  bus: DomainEventBus,
  analytics: FulfilmentMetricsSink,
): void {
  for (const [eventName, metric] of Object.entries(EVENT_TO_METRIC)) {
    bus.subscribe(eventName, () => {
      analytics.increment(metric);
    });
  }
}
