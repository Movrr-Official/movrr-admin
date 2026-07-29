import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { NotificationInsertPort } from "@/features/notifications/application/contracts/NotificationInsertPort";
import type { FulfilmentMetricsSink } from "@/features/analytics/application/contracts/FulfilmentMetricsSink";
import { registerFulfilmentNotificationHandlers } from "@/features/notifications/application/handlers/onFulfilmentEvents";
import { registerFulfilmentMetricsHandlers } from "@/features/analytics/application/handlers/onFulfilmentMetrics";

export type FulfilmentSideEffectDeps = {
  notifications: NotificationInsertPort;
  analytics: FulfilmentMetricsSink;
};

/**
 * Composition helper: wire fulfilment domain events to notification + analytics sinks.
 * Call once at bootstrap (Task 13 may fold this into the full composition root).
 */
export function subscribeFulfilmentSideEffects(
  bus: DomainEventBus,
  deps: FulfilmentSideEffectDeps,
): void {
  registerFulfilmentNotificationHandlers(bus, deps.notifications);
  registerFulfilmentMetricsHandlers(bus, deps.analytics);
}
