import { createHash } from "crypto";
import { describe, it, expect, vi } from "vitest";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";
import { createVoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import { createGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";
import { createTokenService } from "@/features/fulfilment/application/commands/tokenService";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("VoucherPoolResourceProvider", () => {
  it("allocates each pool item once; last item cannot be allocated twice", async () => {
    const provider = createVoucherPoolResourceProvider();
    await provider.seedPool("res-pool-1", [
      { id: "item-1", code: "VOUCHER-A" },
      { id: "item-2", code: "VOUCHER-B" },
      { id: "item-3", code: "VOUCHER-C" },
    ]);

    const first = await provider.allocate({
      fulfilmentId: "ful-1",
      resourceId: "res-pool-1",
    });
    const second = await provider.allocate({
      fulfilmentId: "ful-2",
      resourceId: "res-pool-1",
    });
    const third = await provider.allocate({
      fulfilmentId: "ful-3",
      resourceId: "res-pool-1",
    });
    const fourth = await provider.allocate({
      fulfilmentId: "ful-4",
      resourceId: "res-pool-1",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;

    const allocatedIds = new Set([
      first.value.resourceItemId,
      second.value.resourceItemId,
      third.value.resourceItemId,
    ]);
    expect(allocatedIds.size).toBe(3);
    expect(first.value.status).toBe("reserved");
    expect(third.value.status).toBe("reserved");

    expect(fourth.ok).toBe(false);
    if (fourth.ok) return;
    expect(fourth.kind).toBe("BusinessFailure");
  });

  it("release returns a reserved item to available; fulfil marks it fulfilled", async () => {
    const provider = createVoucherPoolResourceProvider();
    await provider.seedPool("res-pool-2", [
      { id: "item-a", code: "CODE-A" },
    ]);

    const allocated = await provider.allocate({
      fulfilmentId: "ful-rel",
      resourceId: "res-pool-2",
    });
    expect(allocated.ok).toBe(true);
    if (!allocated.ok) return;

    const released = await provider.release({
      fulfilmentId: "ful-rel",
      resourceId: "res-pool-2",
      allocationId: allocated.value.allocationId,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.value.status).toBe("released");

    const reallocated = await provider.allocate({
      fulfilmentId: "ful-rel-2",
      resourceId: "res-pool-2",
    });
    expect(reallocated.ok).toBe(true);
    if (!reallocated.ok) return;
    expect(reallocated.value.resourceItemId).toBe("item-a");

    const fulfilled = await provider.fulfil({
      fulfilmentId: "ful-rel-2",
      resourceId: "res-pool-2",
      allocationId: reallocated.value.allocationId,
    });
    expect(fulfilled.ok).toBe(true);
    if (!fulfilled.ok) return;
    expect(fulfilled.value.status).toBe("fulfilled");
  });
});

describe("GeneratedDigitalResourceProvider", () => {
  it("returns unique codes on each allocate", async () => {
    const provider = createGeneratedDigitalResourceProvider();

    const a = await provider.allocate({
      fulfilmentId: "ful-gen-1",
      resourceId: "res-gen-1",
    });
    const b = await provider.allocate({
      fulfilmentId: "ful-gen-2",
      resourceId: "res-gen-1",
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.value.code).toBeTruthy();
    expect(b.value.code).toBeTruthy();
    expect(a.value.code).not.toBe(b.value.code);
    expect(a.value.status).toBe("reserved");
  });
});

describe("TokenService", () => {
  it("issues a token storing only the hash and enqueues FulfilmentTokenIssued", async () => {
    const bus = new DomainEventBus();
    const issuedSpy = vi.fn();
    bus.subscribe("FulfilmentTokenIssued", issuedSpy);
    const tokens = createTokenService({ eventBus: bus });

    const result = await tokens.issue({
      fulfilmentId: "ful-tok-1",
      tokenType: "qr",
      correlationId: "corr-issue",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.plaintext).toBeTruthy();
    expect(result.value.tokenHash).toBe(sha256(result.value.plaintext));
    expect(result.value.status).toBe("active");
    expect(issuedSpy).not.toHaveBeenCalled();

    await bus.flushAfterCommit();
    expect(issuedSpy).toHaveBeenCalledTimes(1);
    expect(issuedSpy.mock.calls[0]?.[0]?.payload).toMatchObject({
      fulfilmentId: "ful-tok-1",
      tokenId: result.value.tokenId,
      tokenHash: result.value.tokenHash,
    });
    expect(issuedSpy.mock.calls[0]?.[0]?.payload).not.toHaveProperty(
      "plaintext",
    );
  });

  it("consumes a token once; second consume returns already_consumed", async () => {
    const bus = new DomainEventBus();
    const consumedSpy = vi.fn();
    bus.subscribe("FulfilmentTokenConsumed", consumedSpy);
    const tokens = createTokenService({ eventBus: bus });

    const issued = await tokens.issue({
      fulfilmentId: "ful-tok-2",
      tokenType: "one_time_code",
      correlationId: "corr-consume-issue",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const first = await tokens.consume({
      plaintext: issued.value.plaintext,
      correlationId: "corr-consume-1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.status).toBe("consumed");
    expect(consumedSpy).not.toHaveBeenCalled();

    const second = await tokens.consume({
      plaintext: issued.value.plaintext,
      correlationId: "corr-consume-2",
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.kind).toBe("already_consumed");

    await bus.flushAfterCommit();
    expect(consumedSpy).toHaveBeenCalledTimes(1);
  });

  it("does not mutate Fulfilment.state on consume", async () => {
    const bus = new DomainEventBus();
    const tokens = createTokenService({ eventBus: bus });
    const fulfilment = createFulfilment({
      id: "ful-tok-state",
      redemptionId: "red-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "qr_barcode",
      state: "ready",
      idempotencyKey: "idem-1",
    });
    const stateBefore = fulfilment.state;
    const versionBefore = fulfilment.version;

    const issued = await tokens.issue({
      fulfilmentId: fulfilment.id,
      tokenType: "qr",
      correlationId: "corr-state-issue",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const consumed = await tokens.consume({
      plaintext: issued.value.plaintext,
      correlationId: "corr-state-consume",
    });
    expect(consumed.ok).toBe(true);

    expect(fulfilment.state).toBe(stateBefore);
    expect(fulfilment.version).toBe(versionBefore);
    expect(fulfilment.state).toBe("ready");
  });

  it("revokes an active token and enqueues FulfilmentTokenRevoked", async () => {
    const bus = new DomainEventBus();
    const revokedSpy = vi.fn();
    bus.subscribe("FulfilmentTokenRevoked", revokedSpy);
    const tokens = createTokenService({ eventBus: bus });

    const issued = await tokens.issue({
      fulfilmentId: "ful-tok-3",
      tokenType: "barcode",
      correlationId: "corr-revoke-issue",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const revoked = await tokens.revoke({
      tokenId: issued.value.tokenId,
      correlationId: "corr-revoke",
    });
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.value.status).toBe("revoked");

    const consumeAfter = await tokens.consume({
      plaintext: issued.value.plaintext,
      correlationId: "corr-revoke-consume",
    });
    expect(consumeAfter.ok).toBe(false);
    if (consumeAfter.ok) return;
    expect(consumeAfter.kind).toBe("already_revoked");

    await bus.flushAfterCommit();
    expect(revokedSpy).toHaveBeenCalledTimes(1);
  });
});
