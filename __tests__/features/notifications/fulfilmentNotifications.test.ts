import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { createInMemoryNotificationInsertPort } from "@/features/notifications/infrastructure/inMemoryNotificationInsertPort";
import { createInMemoryFulfilmentMetricsSink } from "@/features/analytics/infrastructure/inMemoryFulfilmentMetricsSink";
import { subscribeFulfilmentSideEffects } from "@/features/platform/infrastructure/subscribeFulfilmentSideEffects";

describe("fulfilment notifications + analytics side effects", () => {
  it("inserts an in-app notification when FulfilmentCompleted is flushed", async () => {
    const bus = new DomainEventBus();
    const notifications = createInMemoryNotificationInsertPort();
    const analytics = createInMemoryFulfilmentMetricsSink();
    subscribeFulfilmentSideEffects(bus, { notifications, analytics });

    bus.enqueue({
      name: "FulfilmentCompleted",
      occurredAt: "2026-07-29T10:00:00.000Z",
      correlationId: "corr-1",
      payload: {
        fulfilmentId: "f-1",
        riderId: "rider-1",
        redemptionId: "red-1",
      },
    });

    expect(notifications.list()).toHaveLength(0);
    await bus.flushAfterCommit();

    const rows = notifications.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "rider-1",
      type: "reward",
      metadata: { fulfilmentId: "f-1", redemptionId: "red-1" },
    });
    expect(rows[0].title.length).toBeGreaterThan(0);
    expect(rows[0].message.length).toBeGreaterThan(0);
  });

  it("inserts a notification when fulfilment becomes ready (state changed)", async () => {
    const bus = new DomainEventBus();
    const notifications = createInMemoryNotificationInsertPort();
    const analytics = createInMemoryFulfilmentMetricsSink();
    subscribeFulfilmentSideEffects(bus, { notifications, analytics });

    bus.enqueue({
      name: "FulfilmentStateChanged",
      occurredAt: "2026-07-29T10:00:00.000Z",
      correlationId: "corr-2",
      payload: {
        fulfilmentId: "f-2",
        riderId: "rider-2",
        fromState: "processing",
        toState: "ready",
      },
    });

    await bus.flushAfterCommit();

    const rows = notifications.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "rider-2",
      type: "reward",
      metadata: { fulfilmentId: "f-2", toState: "ready" },
    });
  });

  it("increments analytics counters for completed and expired outcomes", async () => {
    const bus = new DomainEventBus();
    const notifications = createInMemoryNotificationInsertPort();
    const analytics = createInMemoryFulfilmentMetricsSink();
    subscribeFulfilmentSideEffects(bus, { notifications, analytics });

    bus.enqueue({
      name: "FulfilmentCompleted",
      occurredAt: "2026-07-29T10:00:00.000Z",
      correlationId: "corr-3",
      payload: { fulfilmentId: "f-3", riderId: "rider-3" },
    });
    bus.enqueue({
      name: "FulfilmentExpired",
      occurredAt: "2026-07-29T10:01:00.000Z",
      correlationId: "corr-4",
      payload: { fulfilmentId: "f-4", riderId: "rider-4" },
    });
    bus.enqueue({
      name: "FulfilmentCancelled",
      occurredAt: "2026-07-29T10:02:00.000Z",
      correlationId: "corr-5",
      payload: { fulfilmentId: "f-5", riderId: "rider-5" },
    });
    bus.enqueue({
      name: "FulfilmentFailed",
      occurredAt: "2026-07-29T10:03:00.000Z",
      correlationId: "corr-6",
      payload: { fulfilmentId: "f-6", riderId: "rider-6" },
    });
    bus.enqueue({
      name: "FulfilmentRefunded",
      occurredAt: "2026-07-29T10:04:00.000Z",
      correlationId: "corr-7",
      payload: { fulfilmentId: "f-7", riderId: "rider-7" },
    });

    await bus.flushAfterCommit();

    expect(analytics.getCount("redemption_completed")).toBe(1);
    expect(analytics.getCount("expired")).toBe(1);
    expect(analytics.getCount("cancelled")).toBe(1);
    expect(analytics.getCount("failed")).toBe(1);
    expect(analytics.getCount("refunded")).toBe(1);
  });

  it("does not deliver until flushAfterCommit", async () => {
    const bus = new DomainEventBus();
    const notifications = createInMemoryNotificationInsertPort();
    const analytics = createInMemoryFulfilmentMetricsSink();
    subscribeFulfilmentSideEffects(bus, { notifications, analytics });

    bus.enqueue({
      name: "FulfilmentCompleted",
      occurredAt: "2026-07-29T10:00:00.000Z",
      correlationId: "corr-8",
      payload: { fulfilmentId: "f-8", riderId: "rider-8" },
    });

    expect(notifications.list()).toHaveLength(0);
    expect(analytics.getCount("redemption_completed")).toBe(0);
  });

  it("notification and analytics consumers do not import fulfilment engine modules", () => {
    const root = join(process.cwd());
    const sources = [
      "features/notifications/application/handlers/onFulfilmentEvents.ts",
      "features/analytics/application/handlers/onFulfilmentMetrics.ts",
      "features/platform/infrastructure/subscribeFulfilmentSideEffects.ts",
    ];

    for (const relative of sources) {
      const source = readFileSync(join(root, relative), "utf8");
      expect(source).not.toMatch(
        /from\s+["']@\/features\/fulfilment\/application\/FulfilmentEngine["']/,
      );
      expect(source).not.toMatch(
        /from\s+["']@\/features\/fulfilment\/application\//,
      );
    }
  });
});
