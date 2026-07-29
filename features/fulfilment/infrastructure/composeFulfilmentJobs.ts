import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import { createHandlerRegistry } from "@/features/fulfilment/application/HandlerRegistry";
import {
  createFulfilmentEngine,
  type FulfilmentEngine,
} from "@/features/fulfilment/application/FulfilmentEngine";
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

/**
 * Phase-1 job composition: in-memory engine for scheduled routes.
 * Task 13 will freeze a shared registry; SQL-backed store lands later.
 */
export function createFulfilmentJobEngine(): FulfilmentEngine {
  const bus = new DomainEventBus();
  const ledger = createInMemoryLedgerRepository();
  const settlement = createImmediateDebitCompensatingRefundStrategy({
    ledger,
    eventBus: bus,
  });
  const tokens = createTokenService({ eventBus: bus });
  const generated = createGeneratedDigitalResourceProvider();
  const pool = createVoucherPoolResourceProvider();
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

  return createFulfilmentEngine({
    stateMachine: sm,
    registry,
    settlement,
    tokens,
  });
}

let singleton: FulfilmentEngine | null = null;

export function getFulfilmentJobEngine(): FulfilmentEngine {
  if (!singleton) {
    singleton = createFulfilmentJobEngine();
  }
  return singleton;
}
