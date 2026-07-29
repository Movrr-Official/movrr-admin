import { describe, it, expect, beforeEach } from "vitest";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import {
  composeFulfilmentModule,
  getSharedFulfilmentModule,
  resetSharedFulfilmentModuleForTests,
} from "@/features/fulfilment/infrastructure/composeFulfilmentModule";
import {
  createFulfilmentMetrics,
  fulfilmentLogFields,
} from "@/lib/observability/fulfilmentMetrics";

describe("composeFulfilmentModule", () => {
  beforeEach(() => {
    resetSharedFulfilmentModuleForTests();
  });

  it("registers all 8 fulfilment types and freezes the registry", () => {
    const module = composeFulfilmentModule();

    expect(FULFILMENT_TYPES).toHaveLength(8);
    expect(module.registry.isFrozen()).toBe(true);

    for (const type of FULFILMENT_TYPES) {
      expect(module.registry.resolve(type)).toBeTruthy();
    }

    expect(() =>
      module.registry.register(
        "donation",
        module.registry.resolve("donation"),
      ),
    ).toThrow(/frozen/i);
  });

  it("API and jobs share the same engine instance via getSharedFulfilmentModule", () => {
    const a = getSharedFulfilmentModule();
    const b = getSharedFulfilmentModule();

    expect(a).toBe(b);
    expect(a.engine).toBe(b.engine);
    expect(a.bus).toBe(b.bus);
    expect(a.registry.isFrozen()).toBe(true);
  });

  it("subscribes side effects so FulfilmentCompleted notifies after flush", async () => {
    const module = composeFulfilmentModule();

    module.bus.enqueue({
      name: "FulfilmentCompleted",
      occurredAt: new Date().toISOString(),
      correlationId: "corr-comp-1",
      payload: {
        fulfilmentId: "ful-1",
        riderId: "rider-1",
        redemptionId: "red-1",
      },
    });

    await module.bus.flushAfterCommit();

    const rows = module.notifications.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("reward");
    expect(module.analytics.getCount("redemption_completed")).toBe(1);
  });

  it("engine start publishes FulfilmentStateChanged and terminal FulfilmentCompleted", async () => {
    const module = composeFulfilmentModule();
    const events: string[] = [];
    module.bus.subscribe("FulfilmentStateChanged", (e) => {
      events.push(`${e.name}:${(e.payload as { toState?: string }).toState}`);
    });
    module.bus.subscribe("FulfilmentCompleted", () => {
      events.push("FulfilmentCompleted");
    });

    const created = await module.engine.createFromRedemption({
      id: "ful-comp-1",
      redemptionId: "red-comp-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      idempotencyKey: "idem-comp-1",
      resourceId: "res-comp-1",
      pointsCost: 10,
      correlationId: "corr-comp-start",
    });
    expect(created.ok).toBe(true);

    const started = await module.engine.start("ful-comp-1");
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.value.fulfilment.state).toBe("completed");
    }

    await module.bus.flushAfterCommit();

    expect(events.some((e) => e.startsWith("FulfilmentStateChanged:"))).toBe(
      true,
    );
    expect(events).toContain("FulfilmentCompleted");
    expect(events).toContain("FulfilmentStateChanged:completed");
  });
});

describe("fulfilmentMetrics observability", () => {
  it("exposes structured log fields and counters for redeem/fulfilment/validate/jobs", () => {
    const metrics = createFulfilmentMetrics(() => {});

    metrics.recordRedeemAttempt({ correlationId: "c1", catalogItemId: "cat" });
    metrics.recordRedeemSuccess({ correlationId: "c1", fulfilmentId: "f1" });
    metrics.recordFulfilmentFailure({
      correlationId: "c1",
      fulfilmentId: "f1",
      reason: "allocate_failed",
    });
    metrics.recordValidateAttempt({ correlationId: "c1" });
    metrics.recordValidateSuccess({ correlationId: "c1", fulfilmentId: "f1" });
    metrics.recordJobRun({ job: "expire", expired: 2 });
    metrics.recordJobFailure({ job: "release", error: "boom" });
    metrics.recordPoolExhaustion({ resourceId: "pool-1" });

    expect(metrics.getCount("redeem_attempted")).toBe(1);
    expect(metrics.getCount("redeem_succeeded")).toBe(1);
    expect(metrics.getCount("fulfilment_failed")).toBe(1);
    expect(metrics.getCount("validate_attempted")).toBe(1);
    expect(metrics.getCount("validate_succeeded")).toBe(1);
    expect(metrics.getCount("job_expire_run")).toBe(1);
    expect(metrics.getCount("job_release_failed")).toBe(1);
    expect(metrics.getCount("pool_exhausted")).toBe(1);

    expect(fulfilmentLogFields("redeem", { correlationId: "c1" })).toEqual(
      expect.objectContaining({
        area: "fulfilment",
        operation: "redeem",
        correlationId: "c1",
      }),
    );
  });
});
