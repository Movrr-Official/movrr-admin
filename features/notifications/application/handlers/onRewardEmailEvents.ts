import type { DomainEvent } from "@/lib/events/types";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type {
  RewardEmailKind,
  RewardLifecycleEmailInput,
  TransactionalEmailPort,
} from "@/features/notifications/application/contracts/TransactionalEmailPort";

type RewardPayload = {
  riderId?: string;
  fulfilmentId?: string;
  redemptionId?: string;
  catalogItemId?: string;
  pointsSpent?: number;
  fulfilmentType?: string;
  version?: number;
  expiresAt?: string | null;
  reason?: string;
  toState?: string;
};

function payloadOf(event: DomainEvent): RewardPayload {
  return (event.payload ?? {}) as RewardPayload;
}

function eventKey(event: DomainEvent, payload: RewardPayload): string {
  const entity = payload.fulfilmentId ?? payload.redemptionId ?? event.correlationId;
  const version = payload.version === undefined ? "created" : `v${payload.version}`;
  return `reward:${event.name}:${entity}:${version}`.slice(0, 256);
}

async function dispatch(
  email: TransactionalEmailPort,
  event: DomainEvent,
  kind: RewardEmailKind,
): Promise<void> {
  const payload = payloadOf(event);
  if (!payload.riderId || !payload.fulfilmentId) return;

  const input: RewardLifecycleEmailInput = {
    kind,
    idempotencyKey: eventKey(event, payload),
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    riderId: payload.riderId,
    fulfilmentId: payload.fulfilmentId,
    redemptionId: payload.redemptionId,
    catalogItemId: payload.catalogItemId,
    pointsSpent: payload.pointsSpent,
    fulfilmentType: payload.fulfilmentType,
    expiresAt: payload.expiresAt,
    reason: payload.reason,
  };

  try {
    await email.sendRewardLifecycle(input);
  } catch (error) {
    // Email is an after-commit side effect: provider failure must not turn a
    // committed redemption or fulfilment transition into a failed API request.
    console.error("Reward lifecycle email failed", {
      event: event.name,
      correlationId: event.correlationId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export function registerRewardEmailHandlers(
  bus: DomainEventBus,
  email: TransactionalEmailPort,
): void {
  bus.subscribe("RewardRedemptionCreated", (event) =>
    dispatch(email, event, "redemption_received"),
  );

  bus.subscribe("FulfilmentStateChanged", async (event) => {
    if (payloadOf(event).toState !== "ready") return;
    await dispatch(email, event, "ready");
  });

  const terminalKinds = {
    FulfilmentCompleted: "completed",
    FulfilmentCancelled: "cancelled",
    FulfilmentFailed: "failed",
    FulfilmentExpired: "expired",
    FulfilmentRefunded: "refunded",
  } as const;

  for (const [eventName, kind] of Object.entries(terminalKinds)) {
    bus.subscribe(eventName, (event) => dispatch(email, event, kind));
  }
}
