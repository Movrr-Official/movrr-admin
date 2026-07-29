import { describe, it, expect } from "vitest";
import { createInMemoryAuditStore } from "@/features/audit/infrastructure/inMemoryAuditStore";
import { createAuditService } from "@/features/audit/application/commands/auditService";

describe("AuditService", () => {
  it("appends an immutable audit record", async () => {
    const store = createInMemoryAuditStore();
    const audit = createAuditService(store);

    const result = await audit.append({
      actorUserId: "user-1",
      actorEmail: "rider@example.com",
      principalType: "rider",
      capability: "rewards.redeem",
      targetEntityType: "reward_redemption",
      targetEntityId: "red-1",
      previousState: null,
      resultingState: { status: "created" },
      correlationId: "corr-1",
      reason: "redeem accepted",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBeTruthy();
    expect(result.value.createdAt).toBeTruthy();
    expect(result.value.targetEntityId).toBe("red-1");
    expect(result.value.capability).toBe("rewards.redeem");

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(result.value.id);
  });

  it("does not expose update or delete methods", () => {
    const audit = createAuditService(createInMemoryAuditStore());
    expect("update" in audit).toBe(false);
    expect("delete" in audit).toBe(false);
  });

  it("rejects store update attempts (append-only)", async () => {
    const store = createInMemoryAuditStore();
    const audit = createAuditService(store);

    const created = await audit.append({
      actorUserId: "user-1",
      actorEmail: null,
      principalType: "admin",
      capability: "fulfilment.cancel",
      targetEntityType: "fulfilment",
      targetEntityId: "ful-1",
      previousState: { state: "active" },
      resultingState: { state: "cancelled" },
      correlationId: "corr-2",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const update = await store.update(created.value.id, {
      reason: "tamper",
    });
    expect(update.ok).toBe(false);
    if (update.ok) return;
    expect(update.kind).toBe("immutable_audit");

    const listed = await store.list();
    expect(listed[0]?.reason).toBeUndefined();
  });
});
