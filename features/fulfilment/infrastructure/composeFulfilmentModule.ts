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
import {
  createVoucherPoolResourceProvider,
  type VoucherPoolResourceProvider,
} from "@/features/fulfilment/infrastructure/providers/VoucherPoolResourceProvider";
import {
  createTokenService,
  type TokenService,
} from "@/features/fulfilment/application/commands/tokenService";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createImmediateDebitCompensatingRefundStrategy } from "@/features/wallet/application/strategies/ImmediateDebitCompensatingRefundStrategy";
import type { SettlementService, LedgerRepository } from "@/features/wallet/application/contracts/SettlementService";
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
import type { FulfilmentAggregateStore } from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";
import type { TokenStore } from "@/features/fulfilment/application/contracts/TokenStore";
import { createInMemoryFulfilmentAggregateStore } from "@/features/fulfilment/infrastructure/inMemoryFulfilmentAggregateStore";
import { createInMemoryTokenStore } from "@/features/fulfilment/infrastructure/inMemoryTokenStore";

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
  tokenStore: TokenStore;
  settlement: SettlementService;
  ledger: LedgerRepository;
  pool: VoucherPoolResourceProvider;
  store: FulfilmentAggregateStore;
  metrics: FulfilmentMetrics;
  notifications: NotificationInsertPort;
  analytics: FulfilmentMetricsSink;
};

export type ComposeFulfilmentModuleOptions = {
  bus?: DomainEventBus;
  ledger?: LedgerRepository;
  notifications?: NotificationInsertPort;
  analytics?: FulfilmentMetricsSink;
  metrics?: FulfilmentMetrics;
  /** Defaults to in-memory; production injects Supabase store. */
  fulfilmentStore?: FulfilmentAggregateStore;
  tokenStore?: TokenStore;
  /** Defaults to in-memory voucher pool; production injects Supabase pool. */
  pool?: VoucherPoolResourceProvider;
  /** Defaults to in-memory generated digital; production injects Supabase. */
  generated?: FulfilmentResourceProvider;
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
  const tokenStore = options.tokenStore ?? createInMemoryTokenStore();
  const tokens = createTokenService({
    eventBus: bus,
    store: tokenStore,
  });
  const generated =
    options.generated ?? createGeneratedDigitalResourceProvider();
  const pool = options.pool ?? createVoucherPoolResourceProvider();
  const fulfilmentStore =
    options.fulfilmentStore ?? createInMemoryFulfilmentAggregateStore();
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
    store: fulfilmentStore,
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
    tokenStore,
    settlement,
    ledger,
    pool,
    store: fulfilmentStore,
    metrics,
    notifications,
    analytics,
  };
}

let sharedModule: FulfilmentModule | null = null;

function isTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    typeof process.env.VITEST_WORKER_ID === "string"
  );
}

/** Process-wide singleton shared by `/api/v1` and internal job routes. */
export function getSharedFulfilmentModule(): FulfilmentModule {
  if (!sharedModule) {
    if (isTestRuntime()) {
      sharedModule = composeFulfilmentModule();
    } else {
      // Lazy require keeps Vitest from loading server-only Supabase adapters.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseFulfilmentAggregateStore } =
        require("@/features/fulfilment/infrastructure/supabaseFulfilmentAggregateStore") as typeof import("@/features/fulfilment/infrastructure/supabaseFulfilmentAggregateStore");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseTokenStore } =
        require("@/features/fulfilment/infrastructure/supabaseTokenStore") as typeof import("@/features/fulfilment/infrastructure/supabaseTokenStore");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseLedgerRepository } =
        require("@/features/wallet/infrastructure/supabaseLedgerRepository") as typeof import("@/features/wallet/infrastructure/supabaseLedgerRepository");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseVoucherPoolResourceProvider } =
        require("@/features/fulfilment/infrastructure/supabaseVoucherPoolResourceProvider") as typeof import("@/features/fulfilment/infrastructure/supabaseVoucherPoolResourceProvider");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseGeneratedDigitalResourceProvider } =
        require("@/features/fulfilment/infrastructure/supabaseGeneratedDigitalResourceProvider") as typeof import("@/features/fulfilment/infrastructure/supabaseGeneratedDigitalResourceProvider");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseNotificationInsertPort } =
        require("@/features/notifications/infrastructure/supabaseNotificationInsertPort") as typeof import("@/features/notifications/infrastructure/supabaseNotificationInsertPort");
      sharedModule = composeFulfilmentModule({
        fulfilmentStore: createSupabaseFulfilmentAggregateStore(),
        tokenStore: createSupabaseTokenStore(),
        ledger: createSupabaseLedgerRepository(),
        pool: createSupabaseVoucherPoolResourceProvider(),
        generated: createSupabaseGeneratedDigitalResourceProvider(),
        notifications: createSupabaseNotificationInsertPort(),
      });
    }
  }
  return sharedModule;
}

/** Test helper — clears the production singleton between cases. */
export function resetSharedFulfilmentModuleForTests(): void {
  sharedModule = null;
}
