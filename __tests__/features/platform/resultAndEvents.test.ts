import { describe, it, expect, vi } from "vitest";
import { ok, fail } from "@/lib/result/ApplicationResult";
import { DomainEventBus } from "@/lib/events/DomainEventBus";

describe("ApplicationResult", () => {
  it("discriminates success and failure", () => {
    expect(ok({ id: "1" }).ok).toBe(true);
    expect(fail("validation", "bad").ok).toBe(false);
  });
});

describe("DomainEventBus", () => {
  it("does not deliver to subscribers until flushAfterCommit", async () => {
    const bus = new DomainEventBus();
    const spy = vi.fn();
    bus.subscribe("WalletDebited", spy);
    bus.enqueue({ name: "WalletDebited", occurredAt: new Date().toISOString(), correlationId: "c1", payload: {} });
    expect(spy).not.toHaveBeenCalled();
    await bus.flushAfterCommit();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
