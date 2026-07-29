import { describe, it, expect, vi } from "vitest";
import type {
  RiderPrincipal,
  RequestContext,
} from "@/features/identity/domain/Principal";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import { createFraudPolicyEngine } from "@/features/fraud/application/commands/fraudPolicyEngine";
import { createInMemoryIdempotencyStore } from "@/features/fraud/infrastructure/policies/idempotency";
import { createInMemoryReplayStore } from "@/features/fraud/infrastructure/policies/replay";
import { createInMemoryRateLimitStore } from "@/features/fraud/infrastructure/policies/rateLimit";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import { createHandlerRegistry } from "@/features/fulfilment/application/HandlerRegistry";
import { createFulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import { createInstantDigitalHandler } from "@/features/fulfilment/application/handlers/InstantDigitalHandler";
import { createQrBarcodeHandler } from "@/features/fulfilment/application/handlers/QrBarcodeHandler";
import { createUnsupportedFulfilmentHandler } from "@/features/fulfilment/application/handlers/UnsupportedFulfilmentHandler";
import { createGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";
import { createVoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import { createTokenService } from "@/features/fulfilment/application/commands/tokenService";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type { FulfilmentResourceProvider } from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";
import {
  createRedeemRewardService,
  createInMemoryCatalogRepository,
  createInMemoryRedemptionRepository,
  type CatalogItem,
} from "@/features/rewards/application/commands/redeemReward";
import type { RedeemRewardCommand } from "@/features/rewards/application/contracts/RedeemRewardCommand";

function asResourceService(
  provider: FulfilmentResourceProvider,
): ResourceAllocationService {
  return {
    allocate: (input) => provider.allocate(input),
    release: (input) => provider.release(input),
    fulfil: (input) => provider.fulfil(input),
  };
}

function riderCtx(permissions: string[] = ["rewards.redeem"]): RequestContext {
  const principal: RiderPrincipal = {
    type: "rider",
    userId: "user-rider-1",
    email: "rider@example.com",
    riderId: "rider-1",
  };
  return {
    principal,
    correlationId: "corr-redeem-1",
    permissions,
    audit: {
      actorUserId: principal.userId,
      actorEmail: principal.email,
      principalType: "rider",
    },
  };
}

const activeInstant: CatalogItem = {
  id: "cat-instant-1",
  sku: "INSTANT-1",
  title: "Free coffee code",
  status: "active",
  fulfilmentType: "instant_digital",
  pointsPrice: 40,
  resourceId: "res-gen-1",
  partnerOrgId: "org-partner-1",
};

const activeQr: CatalogItem = {
  id: "cat-qr-1",
  sku: "QR-1",
  title: "Partner voucher",
  status: "active",
  fulfilmentType: "qr_barcode",
  pointsPrice: 25,
  resourceId: "res-pool-1",
  partnerOrgId: "org-partner-1",
};

const unsupportedCatalog: CatalogItem = {
  id: "cat-sweep-1",
  sku: "SWEEP-1",
  title: "Sweepstakes entry",
  status: "active",
  fulfilmentType: "sweepstakes",
  pointsPrice: 10,
  resourceId: "res-sweep-1",
  partnerOrgId: null,
};

async function buildHarness(opts?: {
  catalogItems?: CatalogItem[];
  balance?: number;
  poolItems?: Array<{ id: string; code: string }>;
  seedPool?: boolean;
}) {
  const bus = new DomainEventBus();
  const ledger = createInMemoryLedgerRepository();
  await ledger.seedBalance("rider-1", opts?.balance ?? 100);
  const settlement = createImmediateDebitCompensatingRefundStrategy({
    ledger,
    eventBus: bus,
  });

  const generated = createGeneratedDigitalResourceProvider();
  const pool = createVoucherPoolResourceProvider();
  if (opts?.seedPool !== false) {
    await pool.seedPool(
      "res-pool-1",
      opts?.poolItems ?? [{ id: "item-1", code: "VOUCHER-1" }],
    );
  }

  const tokens = createTokenService({ eventBus: bus });
  const sm = createFulfilmentStateMachine();
  const registry = createHandlerRegistry();
  const unsupported = createUnsupportedFulfilmentHandler();
  const instant = createInstantDigitalHandler({
    resources: asResourceService(generated),
  });
  const qr = createQrBarcodeHandler({
    resources: asResourceService(pool),
    tokens,
  });

  for (const type of FULFILMENT_TYPES) {
    if (type === "instant_digital") registry.register(type, instant);
    else if (type === "qr_barcode") registry.register(type, qr);
    else registry.register(type, unsupported);
  }
  registry.freeze();

  const fulfilmentEngine = createFulfilmentEngine({
    stateMachine: sm,
    registry,
    settlement,
    tokens,
    eventBus: bus,
  });

  const fraud = createFraudPolicyEngine({
    idempotency: createInMemoryIdempotencyStore(),
    replay: createInMemoryReplayStore(),
    rateLimit: createInMemoryRateLimitStore({ max: 100, windowMs: 60_000 }),
  });

  const catalog = createInMemoryCatalogRepository(
    opts?.catalogItems ?? [activeInstant, activeQr, unsupportedCatalog],
  );
  const redemptions = createInMemoryRedemptionRepository();

  let redSeq = 0;
  let fulSeq = 0;
  const redeem = createRedeemRewardService({
    authorisation: authorisationService,
    fraud,
    catalog,
    settlement,
    redemptions,
    fulfilmentEngine,
    eventBus: bus,
    ids: {
      nextRedemptionId: () => `red-${++redSeq}`,
      nextFulfilmentId: () => `ful-${++fulSeq}`,
    },
  });

  return { redeem, ledger, bus, redemptions, fraud, settlement };
}

describe("RedeemRewardService", () => {
  it("successful redeem creates financial commitment and 1:1 fulfilment", async () => {
    const { redeem, ledger, bus } = await buildHarness();
    const redemptionSpy = vi.fn();
    const fulfilmentSpy = vi.fn();
    bus.subscribe("RewardRedemptionCreated", redemptionSpy);
    bus.subscribe("FulfilmentCreated", fulfilmentSpy);

    const command: RedeemRewardCommand = {
      catalogItemId: "cat-instant-1",
      idempotencyKey: "idem-ok-1",
    };

    const result = await redeem.execute(riderCtx(), command);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.redemption.id).toBe("red-1");
    expect(result.value.redemption.riderId).toBe("rider-1");
    expect(result.value.redemption.catalogItemId).toBe("cat-instant-1");
    expect(result.value.redemption.pointsSpent).toBe(40);
    expect(result.value.fulfilment.id).toBe("ful-1");
    expect(result.value.fulfilment.redemptionId).toBe("red-1");
    expect(result.value.fulfilment.fulfilmentType).toBe("instant_digital");
    expect(result.value.fulfilment.state).toBe("completed");
    expect(result.value.fulfilment.outcome).toBe("success");

    expect(await ledger.getBalance("rider-1")).toBe(60);

    expect(redemptionSpy).not.toHaveBeenCalled();
    expect(fulfilmentSpy).not.toHaveBeenCalled();
    await bus.flushAfterCommit();
    expect(redemptionSpy).toHaveBeenCalledTimes(1);
    expect(fulfilmentSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks unsupported fulfilment_type before debit", async () => {
    const { redeem, ledger } = await buildHarness();

    const result = await redeem.execute(riderCtx(), {
      catalogItemId: "cat-sweep-1",
      idempotencyKey: "idem-unsupported-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("BusinessFailure");
    expect(await ledger.getBalance("rider-1")).toBe(100);
    expect(await ledger.listEntries("rider-1")).toHaveLength(0);
  });

  it("insufficient points returns BusinessFailure without redemption", async () => {
    const { redeem, ledger, redemptions } = await buildHarness({
      balance: 10,
    });

    const result = await redeem.execute(riderCtx(), {
      catalogItemId: "cat-instant-1",
      idempotencyKey: "idem-broke-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("BusinessFailure");
    expect(await ledger.getBalance("rider-1")).toBe(10);
    expect(await redemptions.findById("red-1")).toBeNull();
  });

  it("idempotent replay returns prior success payload without double debit", async () => {
    const { redeem, ledger } = await buildHarness();

    const command: RedeemRewardCommand = {
      catalogItemId: "cat-instant-1",
      idempotencyKey: "idem-replay-1",
    };

    const first = await redeem.execute(riderCtx(), command);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await redeem.execute(riderCtx(), command);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toEqual(first.value);
    expect(await ledger.getBalance("rider-1")).toBe(60);
    expect(await ledger.listEntries("rider-1")).toHaveLength(1);
  });

  it("failure after debit compensates via refund", async () => {
    const { redeem, ledger } = await buildHarness({
      catalogItems: [activeQr],
      seedPool: false,
    });

    const result = await redeem.execute(riderCtx(), {
      catalogItemId: "cat-qr-1",
      idempotencyKey: "idem-fail-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("BusinessFailure");
    expect(await ledger.getBalance("rider-1")).toBe(100);

    const entries = await ledger.listEntries("rider-1");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.direction).toBe("debit");
    expect(entries[1]?.direction).toBe("credit");
  });

  it("denies without rewards.redeem capability", async () => {
    const { redeem, ledger } = await buildHarness();

    const result = await redeem.execute(riderCtx([]), {
      catalogItemId: "cat-instant-1",
      idempotencyKey: "idem-authz-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("permission_denied");
    expect(await ledger.getBalance("rider-1")).toBe(100);
  });
});
