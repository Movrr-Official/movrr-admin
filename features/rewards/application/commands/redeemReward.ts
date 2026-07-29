import { randomUUID } from "crypto";
import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type { FraudPolicyEngine } from "@/features/fraud/application/contracts/FraudPolicyEngine";
import type { SettlementService } from "@/features/wallet/application/contracts/SettlementService";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
import {
  isSupportedRedeemFulfilmentType,
  type CatalogItem,
  type CatalogRepository,
  type RedeemRewardCommand,
  type RedeemRewardResult,
  type RedemptionRepository,
  type RewardRedemption,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";

const REDEEM_SCOPE = "rewards.redeem";

export type RedeemRewardIdFactory = {
  nextRedemptionId: () => string;
  nextFulfilmentId: () => string;
};

export type RedeemRewardDeps = {
  authorisation: AuthorisationService;
  fraud: FraudPolicyEngine;
  catalog: CatalogRepository;
  settlement: SettlementService;
  redemptions: RedemptionRepository;
  fulfilmentEngine: FulfilmentEngine;
  eventBus: DomainEventBus;
  ids?: Partial<RedeemRewardIdFactory>;
};

export type RedeemRewardService = {
  execute: (
    ctx: RequestContext,
    command: RedeemRewardCommand,
  ) => Promise<ApplicationResult<RedeemRewardResult>>;
};

function riderIdFrom(ctx: RequestContext): ApplicationResult<string> {
  if (ctx.principal.type !== "rider") {
    return fail(
      "BusinessFailure",
      "Only riders can redeem rewards",
    );
  }
  return ok(ctx.principal.riderId);
}

function isSuccessfulFulfilment(fulfilment: Fulfilment): boolean {
  return (
    fulfilment.state === "completed" ||
    fulfilment.state === "awaiting_collection" ||
    fulfilment.state === "ready" ||
    fulfilment.state === "reserved" ||
    fulfilment.state === "processing" ||
    fulfilment.state === "validated" ||
    fulfilment.state === "collected"
  );
}

/**
 * Orchestrates redeem: capability → fraud → catalog → debit → redemption → fulfilment.
 * Events are enqueued only; caller flushes after commit.
 */
export function createRedeemRewardService(
  deps: RedeemRewardDeps,
): RedeemRewardService {
  const ids: RedeemRewardIdFactory = {
    nextRedemptionId: deps.ids?.nextRedemptionId ?? (() => randomUUID()),
    nextFulfilmentId: deps.ids?.nextFulfilmentId ?? (() => randomUUID()),
  };

  return {
    async execute(ctx, command) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.redeem");
      if (!authz.ok) return authz;

      const riderIdResult = riderIdFrom(ctx);
      if (!riderIdResult.ok) return riderIdResult;
      const riderId = riderIdResult.value;

      if (!command.catalogItemId) {
        return fail("validation", "catalogItemId is required");
      }
      if (!command.idempotencyKey) {
        return fail("validation", "idempotencyKey is required");
      }

      const fraudDecision = await deps.fraud.evaluate({
        principalId: riderId,
        scope: REDEEM_SCOPE,
        idempotencyKey: command.idempotencyKey,
        rateLimitKey: `${REDEEM_SCOPE}:${riderId}`,
      });
      if (!fraudDecision.ok) return fraudDecision;

      if (fraudDecision.value.type === "idempotent_replay") {
        return ok(fraudDecision.value.payload as RedeemRewardResult);
      }
      if (fraudDecision.value.type === "deny") {
        return fail("BusinessFailure", fraudDecision.value.reason);
      }

      const catalogItem = await deps.catalog.getById(command.catalogItemId);
      if (!catalogItem) {
        return fail("BusinessFailure", "Catalog item not found");
      }
      if (catalogItem.status !== "active") {
        return fail("BusinessFailure", "Catalog item is not active");
      }
      if (!isSupportedRedeemFulfilmentType(catalogItem.fulfilmentType)) {
        return fail(
          "BusinessFailure",
          `Unsupported fulfilment type: ${catalogItem.fulfilmentType ?? "null"}`,
        );
      }
      if (!catalogItem.resourceId) {
        return fail(
          "BusinessFailure",
          "Catalog item has no resource binding",
        );
      }
      if (!Number.isInteger(catalogItem.pointsPrice) || catalogItem.pointsPrice <= 0) {
        return fail("BusinessFailure", "Catalog item has invalid points price");
      }

      const redemptionId = ids.nextRedemptionId();
      const fulfilmentId = ids.nextFulfilmentId();
      const correlationId = ctx.correlationId;

      const debit = await deps.settlement.debit({
        riderId,
        points: catalogItem.pointsPrice,
        redemptionId,
        correlationId,
      });
      if (!debit.ok) return debit;

      const afterDebit = await continueAfterDebit({
        deps,
        ids: { redemptionId, fulfilmentId },
        riderId,
        catalogItem,
        command,
        correlationId,
        ledgerTransactionId: debit.value.transactionId,
      });

      if (!afterDebit.ok) {
        return afterDebit;
      }

      await deps.fraud.recordIdempotentSuccess(
        {
          principalId: riderId,
          scope: REDEEM_SCOPE,
          key: command.idempotencyKey,
        },
        afterDebit.value,
      );

      return afterDebit;
    },
  };
}

async function continueAfterDebit(input: {
  deps: RedeemRewardDeps;
  ids: { redemptionId: string; fulfilmentId: string };
  riderId: string;
  catalogItem: CatalogItem;
  command: RedeemRewardCommand;
  correlationId: string;
  ledgerTransactionId: string;
}): Promise<ApplicationResult<RedeemRewardResult>> {
  const {
    deps,
    ids,
    riderId,
    catalogItem,
    command,
    correlationId,
    ledgerTransactionId,
  } = input;

  if (
    !isSupportedRedeemFulfilmentType(catalogItem.fulfilmentType) ||
    !catalogItem.resourceId
  ) {
    // Defensive — caller validates before debit; refund if we somehow get here.
    await deps.settlement.refund({
      riderId,
      points: catalogItem.pointsPrice,
      fulfilmentId: ids.fulfilmentId,
      reason: "redeem_orchestration_failed",
      correlationId,
    });
    return fail("BusinessFailure", "Catalog item is not redeemable");
  }

  const fulfilmentType = catalogItem.fulfilmentType;
  const resourceId = catalogItem.resourceId;
  const pointsCost = catalogItem.pointsPrice;

  async function compensate(fulfilmentIdForRefund: string): Promise<void> {
    await deps.settlement.refund({
      riderId,
      points: pointsCost,
      fulfilmentId: fulfilmentIdForRefund,
      reason: "redeem_orchestration_failed",
      correlationId,
    });
  }

  const redemption: RewardRedemption = {
    id: ids.redemptionId,
    riderId,
    catalogItemId: catalogItem.id,
    pointsSpent: pointsCost,
    status: "committed",
    fulfilmentId: ids.fulfilmentId,
    idempotencyKey: command.idempotencyKey,
    ledgerTransactionId,
    createdAt: new Date().toISOString(),
  };
  await deps.redemptions.save(redemption);

  deps.eventBus.enqueue({
    name: "RewardRedemptionCreated",
    occurredAt: redemption.createdAt,
    correlationId,
    payload: {
      redemptionId: redemption.id,
      riderId,
      catalogItemId: catalogItem.id,
      pointsSpent: pointsCost,
      fulfilmentId: ids.fulfilmentId,
    },
  });

  const created = await deps.fulfilmentEngine.createFromRedemption({
    id: ids.fulfilmentId,
    redemptionId: ids.redemptionId,
    riderId,
    catalogItemId: catalogItem.id,
    fulfilmentType,
    idempotencyKey: command.idempotencyKey,
    resourceId,
    pointsCost,
    correlationId,
    partnerOrgId: catalogItem.partnerOrgId,
  });

  if (!created.ok) {
    await compensate(ids.fulfilmentId);
    return created;
  }

  deps.eventBus.enqueue({
    name: "FulfilmentCreated",
    occurredAt: new Date().toISOString(),
    correlationId,
    payload: {
      fulfilmentId: created.value.id,
      redemptionId: ids.redemptionId,
      fulfilmentType,
      state: created.value.state,
      version: created.value.version,
    },
  });

  const started = await deps.fulfilmentEngine.start(ids.fulfilmentId);
  if (!started.ok) {
    await compensate(ids.fulfilmentId);
    return started;
  }

  const fulfilment = started.value.fulfilment;
  if (!isSuccessfulFulfilment(fulfilment)) {
    // Engine may already have compensated (failed → refunded).
    if (fulfilment.state !== "refunded") {
      await compensate(ids.fulfilmentId);
    }
    return fail(
      "BusinessFailure",
      `Fulfilment ended in state ${fulfilment.state} after debit; wallet compensated`,
    );
  }

  return ok({ redemption, fulfilment });
}

export function createInMemoryCatalogRepository(
  seed: CatalogItem[] = [],
): CatalogRepository & { seed: (item: CatalogItem) => void } {
  const items = new Map(seed.map((item) => [item.id, item]));
  return {
    seed(item) {
      items.set(item.id, item);
    },
    async getById(id) {
      return items.get(id) ?? null;
    },
  };
}

export function createInMemoryRedemptionRepository(): RedemptionRepository {
  const rows = new Map<string, RewardRedemption>();
  return {
    async save(redemption) {
      rows.set(redemption.id, redemption);
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
  };
}

// Re-export catalog types used by tests from the command module surface.
export type { CatalogItem, RedeemRewardCommand, RedeemRewardResult };
