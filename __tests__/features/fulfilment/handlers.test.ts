import { describe, it, expect } from "vitest";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import {
  FULFILMENT_TYPES,
  createFulfilment,
  type Fulfilment,
} from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import { createHandlerRegistry } from "@/features/fulfilment/application/HandlerRegistry";
import { createInstantDigitalHandler } from "@/features/fulfilment/application/handlers/InstantDigitalHandler";
import { createQrBarcodeHandler } from "@/features/fulfilment/application/handlers/QrBarcodeHandler";
import { createUnsupportedFulfilmentHandler } from "@/features/fulfilment/application/handlers/UnsupportedFulfilmentHandler";
import { createGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";
import { createVoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import { createTokenService } from "@/features/fulfilment/application/commands/tokenService";
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

function withTransition(
  fulfilment: Fulfilment,
  sm = createFulfilmentStateMachine(),
) {
  let current = fulfilment;
  return {
    get current() {
      return current;
    },
    requestTransition(from: Fulfilment, to: FulfilmentState, reason: string) {
      const result = sm.requestTransition(from, to, reason, from.version);
      if (result.ok) current = result.value;
      return result;
    },
  };
}

describe("HandlerRegistry", () => {
  it("resolves every registered fulfilment type and freezes immutably", () => {
    const registry = createHandlerRegistry();
    const unsupported = createUnsupportedFulfilmentHandler();
    const instant = createInstantDigitalHandler({
      resources: asResourceService(createGeneratedDigitalResourceProvider()),
    });
    const qr = createQrBarcodeHandler({
      resources: asResourceService(createVoucherPoolResourceProvider()),
      tokens: createTokenService({ eventBus: new DomainEventBus() }),
    });

    for (const type of FULFILMENT_TYPES) {
      if (type === "instant_digital") registry.register(type, instant);
      else if (type === "qr_barcode") registry.register(type, qr);
      else registry.register(type, unsupported);
    }

    expect(FULFILMENT_TYPES).toHaveLength(8);
    for (const type of FULFILMENT_TYPES) {
      expect(registry.resolve(type)).toBeTruthy();
    }
    expect(registry.resolve("instant_digital")).toBe(instant);
    expect(registry.resolve("physical_collection")).toBe(unsupported);

    registry.freeze();
    expect(() => registry.register("donation", unsupported)).toThrow(
      /frozen/i,
    );
  });
});

describe("InstantDigitalHandler", () => {
  it("happy path: created → processing → ready → completed via allocate", async () => {
    const provider = createGeneratedDigitalResourceProvider();
    const handler = createInstantDigitalHandler({
      resources: asResourceService(provider),
    });
    const session = withTransition(
      createFulfilment({
        id: "ful-id-1",
        redemptionId: "red-1",
        riderId: "rider-1",
        catalogItemId: "cat-1",
        fulfilmentType: "instant_digital",
        idempotencyKey: "idem-id-1",
      }),
    );

    const result = await handler.start({
      fulfilment: session.current,
      resourceId: "res-gen-1",
      correlationId: "corr-id-1",
      requestTransition: session.requestTransition,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fulfilment.state).toBe("completed");
    expect(result.value.fulfilment.outcome).toBe("success");
    expect(result.value.fulfilment.events.map((e) => e.toState)).toEqual([
      "processing",
      "ready",
      "completed",
    ]);
  });

  it("never assigns fulfilment.state directly — only via requestTransition", async () => {
    const provider = createGeneratedDigitalResourceProvider();
    const handler = createInstantDigitalHandler({
      resources: asResourceService(provider),
    });
    const fulfilment = createFulfilment({
      id: "ful-id-2",
      redemptionId: "red-2",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      idempotencyKey: "idem-id-2",
    });
    const calls: FulfilmentState[] = [];
    const sm = createFulfilmentStateMachine();

    const result = await handler.start({
      fulfilment,
      resourceId: "res-gen-2",
      correlationId: "corr-id-2",
      requestTransition(from, to, reason) {
        calls.push(to);
        return sm.requestTransition(from, to, reason, from.version);
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["processing", "ready", "completed"]);
    expect(fulfilment.state).toBe("created");
  });
});

describe("QrBarcodeHandler", () => {
  it("start reserves resource, issues token, reaches awaiting_collection", async () => {
    const pool = createVoucherPoolResourceProvider();
    await pool.seedPool("res-qr-1", [{ id: "item-1", code: "QR-CODE-1" }]);
    const bus = new DomainEventBus();
    const tokens = createTokenService({ eventBus: bus });
    const handler = createQrBarcodeHandler({
      resources: asResourceService(pool),
      tokens,
    });
    const session = withTransition(
      createFulfilment({
        id: "ful-qr-1",
        redemptionId: "red-qr-1",
        riderId: "rider-1",
        catalogItemId: "cat-1",
        fulfilmentType: "qr_barcode",
        idempotencyKey: "idem-qr-1",
      }),
    );

    const started = await handler.start({
      fulfilment: session.current,
      resourceId: "res-qr-1",
      correlationId: "corr-qr-1",
      tokenType: "qr",
      requestTransition: session.requestTransition,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.fulfilment.state).toBe("awaiting_collection");
    expect(started.value.issuedTokenPlaintext).toBeTruthy();
    expect(started.value.fulfilment.events.map((e) => e.toState)).toEqual([
      "reserved",
      "ready",
      "awaiting_collection",
    ]);
  });

  it("validate → confirm → complete via onTokenConsumed + confirmCollection", async () => {
    const pool = createVoucherPoolResourceProvider();
    await pool.seedPool("res-qr-2", [{ id: "item-2", code: "QR-CODE-2" }]);
    const bus = new DomainEventBus();
    const tokens = createTokenService({ eventBus: bus });
    const handler = createQrBarcodeHandler({
      resources: asResourceService(pool),
      tokens,
    });
    const sm = createFulfilmentStateMachine();
    let current = createFulfilment({
      id: "ful-qr-2",
      redemptionId: "red-qr-2",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "qr_barcode",
      idempotencyKey: "idem-qr-2",
    });
    const requestTransition = (
      from: Fulfilment,
      to: FulfilmentState,
      reason: string,
    ) => {
      const result = sm.requestTransition(from, to, reason, from.version);
      if (result.ok) current = result.value;
      return result;
    };

    const started = await handler.start({
      fulfilment: current,
      resourceId: "res-qr-2",
      correlationId: "corr-qr-2",
      tokenType: "qr",
      requestTransition,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.issuedTokenPlaintext).toBeTruthy();
    current = started.value.fulfilment;

    const consumed = await tokens.consume({
      plaintext: started.value.issuedTokenPlaintext!,
      correlationId: "corr-qr-2c",
    });
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;

    const validated = await handler.onTokenConsumed!({
      fulfilment: current,
      correlationId: "corr-qr-2d",
      token: consumed.value,
      requestTransition,
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.fulfilment.state).toBe("validated");
    current = validated.value.fulfilment;

    const completed = await handler.confirmCollection!({
      fulfilment: current,
      resourceId: "res-qr-2",
      correlationId: "corr-qr-2e",
      requestTransition,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.value.fulfilment.state).toBe("completed");
    expect(completed.value.fulfilment.outcome).toBe("success");
  });
});

describe("UnsupportedFulfilmentHandler", () => {
  it("start returns fulfilment_type_not_implemented without mutating state", async () => {
    const handler = createUnsupportedFulfilmentHandler();
    const fulfilment = createFulfilment({
      id: "ful-un-1",
      redemptionId: "red-un-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "donation",
      idempotencyKey: "idem-un-1",
    });
    let transitionCalled = false;

    const result = await handler.start({
      fulfilment,
      resourceId: "res-none",
      correlationId: "corr-un-1",
      requestTransition(from, to, reason) {
        transitionCalled = true;
        return createFulfilmentStateMachine().requestTransition(
          from,
          to,
          reason,
          from.version,
        );
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("fulfilment_type_not_implemented");
    expect(transitionCalled).toBe(false);
    expect(fulfilment.state).toBe("created");
  });
});
