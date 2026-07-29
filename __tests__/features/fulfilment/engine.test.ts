import { describe, it, expect } from "vitest";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
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
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type { FulfilmentResourceProvider } from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";

function asResourceService(
  provider: FulfilmentResourceProvider,
): ResourceAllocationService {
  return {
    allocate: (input) => provider.allocate(input),
    release: (input) => provider.release(input),
    fulfil: (input) => provider.fulfil(input),
  };
}

async function buildEngine(opts?: {
  pool?: ReturnType<typeof createVoucherPoolResourceProvider>;
}) {
  const bus = new DomainEventBus();
  const ledger = createInMemoryLedgerRepository();
  await ledger.seedBalance("rider-1", 100);
  const settlement = createImmediateDebitCompensatingRefundStrategy({
    ledger,
    eventBus: bus,
  });
  // Pre-debit to simulate redeem commitment
  await settlement.debit({
    riderId: "rider-1",
    points: 25,
    redemptionId: "red-engine-1",
    correlationId: "corr-debit",
  });

  const generated = createGeneratedDigitalResourceProvider();
  const pool = opts?.pool ?? createVoucherPoolResourceProvider();
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

  const engine = createFulfilmentEngine({
    stateMachine: sm,
    registry,
    settlement,
    tokens,
  });

  return { engine, ledger, tokens, pool, bus };
}

describe("FulfilmentEngine", () => {
  it("createFromRedemption yields created @ version 0", async () => {
    const { engine } = await buildEngine();

    const created = await engine.createFromRedemption({
      id: "ful-e-1",
      redemptionId: "red-engine-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      idempotencyKey: "idem-e-1",
      resourceId: "res-e-1",
      pointsCost: 25,
      correlationId: "corr-e-1",
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.state).toBe("created");
    expect(created.value.version).toBe(0);
    expect(created.value.fulfilmentType).toBe("instant_digital");
  });

  it("instant digital start completes and does not refund", async () => {
    const { engine, ledger } = await buildEngine();

    await engine.createFromRedemption({
      id: "ful-e-2",
      redemptionId: "red-engine-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      idempotencyKey: "idem-e-2",
      resourceId: "res-e-2",
      pointsCost: 25,
      correlationId: "corr-e-2",
    });

    const started = await engine.start("ful-e-2");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.fulfilment.state).toBe("completed");
    expect(started.value.fulfilment.outcome).toBe("success");
    expect(await ledger.getBalance("rider-1")).toBe(75);
  });

  it("unsupported start fails safely with fulfilment_type_not_implemented", async () => {
    const { engine, ledger } = await buildEngine();

    await engine.createFromRedemption({
      id: "ful-e-3",
      redemptionId: "red-engine-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "sweepstakes",
      idempotencyKey: "idem-e-3",
      resourceId: "res-e-3",
      pointsCost: 25,
      correlationId: "corr-e-3",
    });

    const started = await engine.start("ful-e-3");
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.kind).toBe("fulfilment_type_not_implemented");
    expect(await ledger.getBalance("rider-1")).toBe(75);
  });

  it("QR: start → onTokenConsumed → confirmCollection completes", async () => {
    const pool = createVoucherPoolResourceProvider();
    await pool.seedPool("res-e-qr", [{ id: "item-e", code: "ENG-QR-1" }]);
    const { engine, tokens } = await buildEngine({ pool });

    await engine.createFromRedemption({
      id: "ful-e-qr",
      redemptionId: "red-engine-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "qr_barcode",
      idempotencyKey: "idem-e-qr",
      resourceId: "res-e-qr",
      pointsCost: 25,
      correlationId: "corr-e-qr",
      tokenType: "qr",
    });

    const started = await engine.start("ful-e-qr");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.fulfilment.state).toBe("awaiting_collection");
    expect(started.value.issuedTokenPlaintext).toBeTruthy();

    const consumed = await tokens.consume({
      plaintext: started.value.issuedTokenPlaintext!,
      correlationId: "corr-e-qr-consume",
    });
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;

    const validated = await engine.onTokenConsumed({
      fulfilmentId: "ful-e-qr",
      token: consumed.value,
      correlationId: "corr-e-qr-on",
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.fulfilment.state).toBe("validated");

    const confirmed = await engine.confirmCollection("ful-e-qr");
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.fulfilment.state).toBe("completed");
    expect(confirmed.value.fulfilment.outcome).toBe("success");
  });

  it("cancel then refund compensates wallet via SettlementService", async () => {
    const { engine, ledger } = await buildEngine();

    await engine.createFromRedemption({
      id: "ful-e-4",
      redemptionId: "red-engine-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      idempotencyKey: "idem-e-4",
      resourceId: "res-e-4",
      pointsCost: 25,
      correlationId: "corr-e-4",
    });

    const cancelled = await engine.cancel("ful-e-4", "rider_request");
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.value.fulfilment.state).toBe("cancelled");

    const refunded = await engine.refund("ful-e-4", "rider_request");
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) return;
    expect(refunded.value.fulfilment.state).toBe("refunded");
    expect(refunded.value.fulfilment.outcome).toBe("refunded");
    expect(await ledger.getBalance("rider-1")).toBe(100);
  });
});
