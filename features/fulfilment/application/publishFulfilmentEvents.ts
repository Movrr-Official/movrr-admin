import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";

const TERMINAL_EVENTS: Partial<Record<FulfilmentState, string>> = {
  completed: "FulfilmentCompleted",
  cancelled: "FulfilmentCancelled",
  expired: "FulfilmentExpired",
  failed: "FulfilmentFailed",
  refunded: "FulfilmentRefunded",
};

/**
 * Enqueue FulfilmentStateChanged (+ terminal event when applicable).
 * Callers flush via DomainEventBus.flushAfterCommit after commit.
 */
export function enqueueFulfilmentTransitionEvents(
  bus: DomainEventBus,
  input: {
    fulfilment: Fulfilment;
    fromState: FulfilmentState;
    toState: FulfilmentState;
    reason: string;
    correlationId: string;
  },
): void {
  const occurredAt = new Date().toISOString();
  const basePayload = {
    fulfilmentId: input.fulfilment.id,
    riderId: input.fulfilment.riderId,
    redemptionId: input.fulfilment.redemptionId,
    fulfilmentType: input.fulfilment.fulfilmentType,
    fromState: input.fromState,
    toState: input.toState,
    reason: input.reason,
    version: input.fulfilment.version,
    outcome: input.fulfilment.outcome,
  };

  bus.enqueue({
    name: "FulfilmentStateChanged",
    occurredAt,
    correlationId: input.correlationId,
    payload: basePayload,
  });

  const terminalName = TERMINAL_EVENTS[input.toState];
  if (terminalName) {
    bus.enqueue({
      name: terminalName,
      occurredAt,
      correlationId: input.correlationId,
      payload: basePayload,
    });
  }
}
