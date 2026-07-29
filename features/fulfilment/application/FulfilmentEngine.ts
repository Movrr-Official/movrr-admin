import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import {
  createFulfilment,
  type Fulfilment,
  type FulfilmentType,
} from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import type { HandlerRegistry } from "@/features/fulfilment/application/HandlerRegistry";
import type {
  FulfilmentHandlerResult,
  RequestTransition,
} from "@/features/fulfilment/application/contracts/FulfilmentHandler";
import type {
  FulfilmentAggregateStore,
  StoredFulfilmentAggregate,
} from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";
import { createInMemoryFulfilmentAggregateStore } from "@/features/fulfilment/infrastructure/inMemoryFulfilmentAggregateStore";
import type {
  TokenRecord,
  TokenService,
  TokenType,
} from "@/features/fulfilment/application/commands/tokenService";
import type { SettlementService } from "@/features/wallet/application/contracts/SettlementService";
import { enqueueFulfilmentTransitionEvents } from "@/features/fulfilment/application/publishFulfilmentEvents";

export type CreateFromRedemptionInput = {
  id: string;
  redemptionId: string;
  riderId: string;
  catalogItemId: string;
  fulfilmentType: FulfilmentType;
  idempotencyKey: string;
  resourceId: string;
  pointsCost: number;
  correlationId: string;
  partnerOrgId?: string | null;
  expiresAt?: string | null;
  tokenType?: TokenType;
  metadata?: Record<string, unknown>;
};

export type OnTokenConsumedInput = {
  fulfilmentId: string;
  token: TokenRecord;
  correlationId: string;
};

export type FulfilmentEngine = {
  createFromRedemption: (
    input: CreateFromRedemptionInput,
  ) => Promise<ApplicationResult<Fulfilment>>;
  get: (fulfilmentId: string) => Promise<ApplicationResult<Fulfilment>>;
  list: () => Promise<Fulfilment[]>;
  start: (
    fulfilmentId: string,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  onTokenConsumed: (
    input: OnTokenConsumedInput,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  cancel: (
    fulfilmentId: string,
    reason: string,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  expire: (
    fulfilmentId: string,
    reason: string,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  refund: (
    fulfilmentId: string,
    reason: string,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
  confirmCollection: (
    fulfilmentId: string,
  ) => Promise<ApplicationResult<FulfilmentHandlerResult>>;
};

export type FulfilmentEngineDeps = {
  stateMachine: FulfilmentStateMachine;
  registry: HandlerRegistry;
  settlement: SettlementService;
  tokens: TokenService;
  /** Publishes FulfilmentStateChanged + terminal events after successful SM transitions. */
  eventBus: DomainEventBus;
  /** Defaults to in-memory; production injects Supabase-backed store. */
  store?: FulfilmentAggregateStore;
};

/**
 * Sole cross-feature orchestrator for fulfilment workflows.
 * Handlers execute type-specific behaviour and only request SM transitions.
 */
export function createFulfilmentEngine(
  deps: FulfilmentEngineDeps,
): FulfilmentEngine {
  const store = deps.store ?? createInMemoryFulfilmentAggregateStore();

  async function getStored(
    fulfilmentId: string,
  ): Promise<ApplicationResult<StoredFulfilmentAggregate>> {
    const stored = await store.get(fulfilmentId);
    if (!stored) {
      return fail("not_found", `Fulfilment ${fulfilmentId} not found`);
    }
    return ok(stored);
  }

  async function persist(stored: StoredFulfilmentAggregate): Promise<void> {
    await store.save(stored);
  }

  function publishTransition(
    stored: StoredFulfilmentAggregate,
    fromState: Fulfilment["state"],
    next: Fulfilment,
    reason: string,
  ): void {
    enqueueFulfilmentTransitionEvents(deps.eventBus, {
      fulfilment: next,
      fromState,
      toState: next.state,
      reason,
      correlationId: stored.correlationId,
    });
  }

  function applySmTransition(
    stored: StoredFulfilmentAggregate,
    fulfilment: Fulfilment,
    to: Fulfilment["state"],
    reason: string,
  ): ApplicationResult<Fulfilment> {
    const fromState = fulfilment.state;
    const result = deps.stateMachine.requestTransition(
      fulfilment,
      to,
      reason,
      fulfilment.version,
    );
    if (result.ok) {
      publishTransition(stored, fromState, result.value, reason);
    }
    return result;
  }

  function requestTransitionFor(fulfilmentId: string): RequestTransition {
    return async (fulfilment, to, reason) => {
      const existing = await store.get(fulfilmentId);
      if (!existing) {
        return fail("not_found", `Fulfilment ${fulfilmentId} not found`);
      }
      const result = applySmTransition(existing, fulfilment, to, reason);
      if (result.ok) {
        await persist({ ...existing, fulfilment: result.value });
      }
      return result;
    };
  }

  async function compensateIfFailed(
    stored: StoredFulfilmentAggregate,
    fulfilment: Fulfilment,
  ): Promise<void> {
    if (fulfilment.state !== "failed") return;
    await deps.settlement.refund({
      riderId: fulfilment.riderId,
      points: stored.pointsCost,
      fulfilmentId: fulfilment.id,
      reason: "fulfilment_failed",
      correlationId: stored.correlationId,
    });
    const refunded = applySmTransition(
      stored,
      fulfilment,
      "refunded",
      "compensating_refund",
    );
    if (refunded.ok) {
      await persist({ ...stored, fulfilment: refunded.value });
    }
  }

  return {
    async createFromRedemption(input) {
      if (await store.exists(input.id)) {
        return fail("BusinessFailure", "Fulfilment already exists");
      }

      const fulfilment = createFulfilment({
        id: input.id,
        redemptionId: input.redemptionId,
        riderId: input.riderId,
        catalogItemId: input.catalogItemId,
        fulfilmentType: input.fulfilmentType,
        state: "created",
        version: 0,
        partnerOrgId: input.partnerOrgId ?? null,
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt ?? null,
        metadata: input.metadata ?? {},
      });

      await persist({
        fulfilment,
        resourceId: input.resourceId,
        pointsCost: input.pointsCost,
        correlationId: input.correlationId,
        tokenType: input.tokenType ?? "qr",
      });

      return ok(fulfilment);
    },

    async get(fulfilmentId) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      return ok(loaded.value.fulfilment);
    },

    async list() {
      const rows = await store.list();
      return rows.map((entry) => entry.fulfilment);
    },

    async start(fulfilmentId) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;
      const handler = deps.registry.resolve(
        stored.fulfilment.fulfilmentType,
      );

      const result = await handler.start({
        fulfilment: stored.fulfilment,
        resourceId: stored.resourceId,
        correlationId: stored.correlationId,
        tokenType: stored.tokenType,
        requestTransition: requestTransitionFor(fulfilmentId),
      });

      if (!result.ok) return result;

      await persist({ ...stored, fulfilment: result.value.fulfilment });

      if (result.value.fulfilment.state === "failed") {
        await compensateIfFailed(
          { ...stored, fulfilment: result.value.fulfilment },
          result.value.fulfilment,
        );
        const after = await store.get(fulfilmentId);
        if (after) {
          return ok({ fulfilment: after.fulfilment });
        }
      }

      return result;
    },

    async onTokenConsumed(input) {
      const loaded = await getStored(input.fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;
      const handler = deps.registry.resolve(
        stored.fulfilment.fulfilmentType,
      );

      if (!handler.onTokenConsumed) {
        return fail(
          "BusinessFailure",
          "Handler does not support token consumption",
        );
      }

      const result = await handler.onTokenConsumed({
        fulfilment: stored.fulfilment,
        correlationId: input.correlationId,
        token: input.token,
        requestTransition: requestTransitionFor(input.fulfilmentId),
      });

      if (result.ok) {
        await persist({ ...stored, fulfilment: result.value.fulfilment });
      }
      return result;
    },

    async cancel(fulfilmentId, reason) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;
      const handler = deps.registry.resolve(
        stored.fulfilment.fulfilmentType,
      );
      const requestTransition = requestTransitionFor(fulfilmentId);

      if (handler.cancel) {
        const result = await handler.cancel({
          fulfilment: stored.fulfilment,
          reason,
          resourceId: stored.resourceId,
          correlationId: stored.correlationId,
          requestTransition,
        });
        if (result.ok) {
          await persist({ ...stored, fulfilment: result.value.fulfilment });
        }
        return result;
      }

      const cancelled = await requestTransition(
        stored.fulfilment,
        "cancelled",
        reason,
      );
      if (!cancelled.ok) return cancelled;
      const value = { fulfilment: cancelled.value };
      await persist({ ...stored, fulfilment: cancelled.value });
      return ok(value);
    },

    async expire(fulfilmentId, reason) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;

      if (stored.fulfilment.state === "expired") {
        return ok({ fulfilment: stored.fulfilment });
      }

      const handler = deps.registry.resolve(
        stored.fulfilment.fulfilmentType,
      );
      const requestTransition = requestTransitionFor(fulfilmentId);

      if (handler.expire) {
        const result = await handler.expire({
          fulfilment: stored.fulfilment,
          reason,
          resourceId: stored.resourceId,
          correlationId: stored.correlationId,
          requestTransition,
        });
        if (result.ok) {
          await persist({ ...stored, fulfilment: result.value.fulfilment });
        }
        return result;
      }

      const expired = await requestTransition(
        stored.fulfilment,
        "expired",
        reason,
      );
      if (!expired.ok) return expired;
      await persist({ ...stored, fulfilment: expired.value });
      return ok({ fulfilment: expired.value });
    },

    async refund(fulfilmentId, reason) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;

      const refundable = ["cancelled", "failed", "expired"] as const;
      if (
        !refundable.includes(
          stored.fulfilment.state as (typeof refundable)[number],
        )
      ) {
        return fail(
          "BusinessFailure",
          `Cannot refund from state ${stored.fulfilment.state}`,
        );
      }

      const settled = await deps.settlement.refund({
        riderId: stored.fulfilment.riderId,
        points: stored.pointsCost,
        fulfilmentId: fulfilmentId,
        reason,
        correlationId: stored.correlationId,
      });
      if (!settled.ok) return settled;

      const refunded = applySmTransition(
        stored,
        stored.fulfilment,
        "refunded",
        reason,
      );
      if (!refunded.ok) return refunded;

      await persist({ ...stored, fulfilment: refunded.value });
      return ok({ fulfilment: refunded.value });
    },

    async confirmCollection(fulfilmentId) {
      const loaded = await getStored(fulfilmentId);
      if (!loaded.ok) return loaded;
      const stored = loaded.value;
      const handler = deps.registry.resolve(
        stored.fulfilment.fulfilmentType,
      );

      if (!handler.confirmCollection) {
        return fail(
          "BusinessFailure",
          "Handler does not support collection confirmation",
        );
      }

      const result = await handler.confirmCollection({
        fulfilment: stored.fulfilment,
        resourceId: stored.resourceId,
        correlationId: stored.correlationId,
        requestTransition: requestTransitionFor(fulfilmentId),
      });

      if (result.ok) {
        await persist({ ...stored, fulfilment: result.value.fulfilment });
      }
      return result;
    },
  };
}
