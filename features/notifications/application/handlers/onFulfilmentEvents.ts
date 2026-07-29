import type { DomainEvent } from "@/lib/events/types";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { NotificationInsertPort } from "@/features/notifications/application/contracts/NotificationInsertPort";

type RiderScopedPayload = {
  fulfilmentId?: string;
  riderId?: string;
  redemptionId?: string;
  fromState?: string;
  toState?: string;
};

function asPayload(event: DomainEvent): RiderScopedPayload {
  return (event.payload ?? {}) as RiderScopedPayload;
}

/**
 * Reactive notification consumers for fulfilment domain events.
 * Consumers only — never mutate fulfilment aggregates.
 */
export function registerFulfilmentNotificationHandlers(
  bus: DomainEventBus,
  notifications: NotificationInsertPort,
): void {
  bus.subscribe("FulfilmentCompleted", async (event) => {
    const payload = asPayload(event);
    if (!payload.riderId || !payload.fulfilmentId) return;

    await notifications.insert({
      userId: payload.riderId,
      type: "reward",
      title: "Reward fulfilled",
      message: "Your reward has been completed.",
      metadata: {
        fulfilmentId: payload.fulfilmentId,
        ...(payload.redemptionId
          ? { redemptionId: payload.redemptionId }
          : {}),
      },
    });
  });

  bus.subscribe("FulfilmentStateChanged", async (event) => {
    const payload = asPayload(event);
    if (
      !payload.riderId ||
      !payload.fulfilmentId ||
      payload.toState !== "ready"
    ) {
      return;
    }

    await notifications.insert({
      userId: payload.riderId,
      type: "reward",
      title: "Reward ready",
      message: "Your reward is ready.",
      metadata: {
        fulfilmentId: payload.fulfilmentId,
        toState: "ready",
        ...(payload.redemptionId
          ? { redemptionId: payload.redemptionId }
          : {}),
      },
    });
  });
}
