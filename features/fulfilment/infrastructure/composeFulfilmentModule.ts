import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import {
  createHandlerRegistry,
  type HandlerRegistry,
} from "@/features/fulfilment/application/HandlerRegistry";
import {
  createFulfilmentEngine,
  type FulfilmentEngine,
} from "@/features/fulfilment/application/FulfilmentEngine";
import { createInstantDigitalHandler } from "@/features/fulfilment/application/handlers/InstantDigitalHandler";
import { createQrBarcodeHandler } from "@/features/fulfilment/application/handlers/QrBarcodeHandler";
import { createUnsupportedFulfilmentHandler } from "@/features/fulfilment/application/handlers/UnsupportedFulfilmentHandler";
import { createGeneratedDigitalResourceProvider } from "@/features/fulfilment/infrastructure/providers/GeneratedDigitalResourceProvider";
import { createVoucherPoolResourceProvider } from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import {
  createTokenService,
  type TokenService,
} from "@/features/fulfilment/application/commands/tokenService";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";
import type { SettlementService } from "@/features/wallet/application/contracts/SettlementService";
import type { ResourceAllocationService } from "@/features/fulfilment/application/contracts/ResourceAllocationService";
import type { FulfilmentResourceProvider } from "@/features/fulfilment/application/contracts/FulfilmentResourceProvider";
import { subscribeFulfilmentSideEffects } from "@/features/platform/infrastructure/subscribeFulfilmentSideEffects";
import {
  createInMemoryNotificationInsertPort,
  type InMemoryNotificationInsertPort,
} from "@/features/notifications/infrastructure/inMemoryNotificationInsertPort";
import { createInMemoryFulfilmentMetricsSink } from "@/features/analytics/infrastructure/inMemoryFulfilmentMetricsSink";
import type { FulfilmentMetricsSink } from "@/features/analytics/application/contracts/FulfilmentMetricsSink";
import type { NotificationInsertPort } from "@/features/notifications/application/contracts/NotificationInsertPort";
import {
  createFulfilmentMetrics,
  type FulfilmentMetrics,
} from "@/lib/observability/fulfilmentMetrics";

function asResourceService(
  provider: FulfilmentResourceProvider,
): ResourceAllocationService {
  return {
    allocate: (input) => provider.allocate(input),
    release: (input) => provider.release(input),
    fulfil: (input) => provider.fulfil(input),
  };
}

export type FulfilmentModule = {
  bus: DomainEventBus;
  engine: FulfilmentEngine;
  registry: HandlerRegistry;
  tokens: TokenService;
  settlement: SettlementService;
  ledger: ReturnType<typeof createInMemoryLedgerRepository>;
  pool: ReturnType<typeof createVoucherPoolResourceProvider>;
  metrics: FulfilmentMetrics;
  notifications: InMemoryNotificationInsertPort;
  analytics: FulfilmentMetricsSink;
};

export type ComposeFulfilmentModuleOptions = {
  bus?: DomainEventBus;
  ledger?: ReturnType<typeof createInMemoryLedgerRepository>;
  notifications?: InMemoryNotificationInsertPort;
  analytics?: FulfilmentMetricsSink;
  metrics?: FulfilmentMetrics;
  /** When false, skip subscribeFulfilmentSideEffects (tests that wire consumers manually). Default true. */
  subscribeSideEffects?: boolean;
};

/**
 * Shared composition root for fulfilment: frozen handler registry (all 8 types),
 * engine + tokens + settlement, side-effect subscriptions, observability counters.
 * Used by Platform API and internal jobs so they share one engine store.
 */
export function composeFulfilmentModule(
  options: ComposeFulfilmentModuleOptions = {},
): FulfilmentModule {
  const bus = options.bus ?? new DomainEventBus();
  const ledger = options.ledger ?? createInMemoryLedgerRepository();
  const notifications =
    options.notifications ?? createInMemoryNotificationInsertPort();
  const analytics =
    options.analytics ?? createInMemoryFulfilmentMetricsSink();
  const metrics = options.metrics ?? createFulfilmentMetrics();

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

  const engine = createFulfilmentEngine({
    stateMachine: sm,
    registry,
    settlement,
    tokens,
    eventBus: bus,
  });

  if (options.subscribeSideEffects !== false) {
    subscribeFulfilmentSideEffects(bus, {
      notifications: notifications as NotificationInsertPort,
      analytics,
    });
  }

  return {
    bus,
    engine,
    registry,
    tokens,
    settlement,
    ledger,
    pool,
    metrics,
    notifications,
    analytics,
  };
}

let sharedModule: FulfilmentModule | null = null;

/** Process-wide singleton shared by `/api/v1` and internal job routes. */
export function getSharedFulfilmentModule(): FulfilmentModule {
  if (!sharedModule) {
    sharedModule = composeFulfilmentModule();
  }
  return sharedModule;
}

/** Test helper — clears the production singleton between cases. */
export function resetSharedFulfilmentModuleForTests(): void {
  sharedModule = null;
}
