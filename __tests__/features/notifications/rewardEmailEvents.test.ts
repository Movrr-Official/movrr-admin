import { describe, expect, it, vi } from "vitest";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { registerRewardEmailHandlers } from "@/features/notifications/application/handlers/onRewardEmailEvents";
import type { TransactionalEmailPort } from "@/features/notifications/application/contracts/TransactionalEmailPort";

function event(name: string, payload: Record<string, unknown>) {
  return {
    name,
    occurredAt: "2026-09-07T12:00:00.000Z",
    correlationId: "correlation-1",
    payload,
  };
}

describe("reward lifecycle email events", () => {
  it("maps post-commit events to deterministic, idempotent messages", async () => {
    const bus = new DomainEventBus();
    const sendRewardLifecycle = vi.fn().mockResolvedValue(undefined);
    registerRewardEmailHandlers(bus, { sendRewardLifecycle });

    bus.enqueue(event("RewardRedemptionCreated", {
      riderId: "rider-1",
      fulfilmentId: "fulfilment-1",
      redemptionId: "redemption-1",
      catalogItemId: "catalog-1",
      pointsSpent: 1200,
    }));
    bus.enqueue(event("FulfilmentStateChanged", {
      riderId: "rider-1",
      fulfilmentId: "fulfilment-1",
      catalogItemId: "catalog-1",
      toState: "ready",
      version: 2,
    }));
    bus.enqueue(event("FulfilmentCompleted", {
      riderId: "rider-1",
      fulfilmentId: "fulfilment-1",
      catalogItemId: "catalog-1",
      version: 3,
    }));

    await bus.flushAfterCommit();

    expect(sendRewardLifecycle).toHaveBeenCalledTimes(3);
    expect(sendRewardLifecycle.mock.calls.map(([input]) => input.kind)).toEqual([
      "redemption_received",
      "ready",
      "completed",
    ]);
    expect(sendRewardLifecycle.mock.calls[1][0].idempotencyKey).toBe(
      "reward:FulfilmentStateChanged:fulfilment-1:v2",
    );
  });

  it("does not send for intermediate state changes", async () => {
    const bus = new DomainEventBus();
    const sendRewardLifecycle = vi.fn().mockResolvedValue(undefined);
    registerRewardEmailHandlers(bus, { sendRewardLifecycle });
    bus.enqueue(event("FulfilmentStateChanged", {
      riderId: "rider-1",
      fulfilmentId: "fulfilment-1",
      toState: "processing",
      version: 1,
    }));

    await bus.flushAfterCommit();
    expect(sendRewardLifecycle).not.toHaveBeenCalled();
  });

  it("isolates delivery failure from the committed domain operation", async () => {
    const bus = new DomainEventBus();
    const email: TransactionalEmailPort = {
      sendRewardLifecycle: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerRewardEmailHandlers(bus, email);
    bus.enqueue(event("FulfilmentRefunded", {
      riderId: "rider-1",
      fulfilmentId: "fulfilment-1",
      version: 4,
    }));

    await expect(bus.flushAfterCommit()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "Reward lifecycle email failed",
      expect.objectContaining({ event: "FulfilmentRefunded" }),
    );
    log.mockRestore();
  });
});
