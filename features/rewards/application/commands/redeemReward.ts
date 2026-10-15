import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type { DomainEventBus } from "@/lib/events/DomainEventBus";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type { FraudPolicyEngine } from "@/features/fraud/application/contracts/FraudPolicyEngine";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import type {
  CatalogItem,
  CatalogRepository,
  RedeemRewardCommand,
  RedeemRewardResult,
  RedemptionRepository,
} from "../contracts/RedeemRewardCommand";

export type RedeemRewardDeps = {
  authorisation: AuthorisationService;
  fraud: FraudPolicyEngine;
  redemptions: RedemptionRepository;
  fulfilmentEngine: FulfilmentEngine;
  eventBus: DomainEventBus;
};
export type RedeemRewardService = {
  execute: (
    ctx: RequestContext,
    command: RedeemRewardCommand,
  ) => Promise<ApplicationResult<RedeemRewardResult>>;
};

/** The database commits eligibility, debit, redemption, fulfilment and replay receipt atomically. */
export function createRedeemRewardService(
  deps: RedeemRewardDeps,
): RedeemRewardService {
  return {
    async execute(ctx, command) {
      const authz = deps.authorisation.assertCapability(ctx, "rewards.redeem");
      if (!authz.ok) return authz;
      if (ctx.principal.type !== "rider")
        return fail("permission_denied", "Only riders can redeem rewards");
      if (
        !command.catalogItemId ||
        !command.idempotencyKey ||
        command.idempotencyKey.length > 200
      )
        return fail(
          "validation",
          "Reward and valid operation identifier required",
        );
      // Rate limiting remains an API concern; financial replay never depends on this cache.
      const fraud = await deps.fraud.evaluate({
        principalId: ctx.principal.riderId,
        scope: "rewards.redeem",
        rateLimitKey: `rewards.redeem:${ctx.principal.riderId}`,
      });
      if (!fraud.ok) return fraud;
      if (fraud.value.type === "deny")
        return fail("BusinessFailure", fraud.value.reason);
      const committed = await deps.redemptions.commit({
        riderId: ctx.principal.riderId,
        actorId: ctx.principal.userId,
        catalogItemId: command.catalogItemId,
        operationId: command.idempotencyKey,
        correlationId: ctx.correlationId,
      });
      if (!committed.ok) return committed;
      const redemption = committed.value;
      deps.eventBus.enqueue({
        name: "RewardRedemptionCreated",
        occurredAt: redemption.createdAt,
        correlationId: ctx.correlationId,
        payload: {
          riderId: redemption.riderId,
          redemptionId: redemption.id,
          fulfilmentId: redemption.fulfilmentId,
          catalogItemId: redemption.catalogItemId,
          pointsSpent: redemption.pointsSpent,
        },
      });
      deps.eventBus.enqueue({
        name: "FulfilmentCreated",
        occurredAt: redemption.createdAt,
        correlationId: ctx.correlationId,
        payload: {
          fulfilmentId: redemption.fulfilmentId,
          redemptionId: redemption.id,
        },
      });
      let current = await deps.fulfilmentEngine.get(redemption.fulfilmentId);
      if (!current.ok) return current;
      if (
        ["created", "processing", "reserved", "ready"].includes(
          current.value.state,
        )
      ) {
        // A network or process failure after commitment must never cause a second debit or an unproven refund.
        try {
          const started = await deps.fulfilmentEngine.start(
            redemption.fulfilmentId,
          );
          if (started.ok) current = ok(started.value.fulfilment);
          else
            current = await deps.fulfilmentEngine.get(redemption.fulfilmentId);
        } catch {
          current = await deps.fulfilmentEngine.get(redemption.fulfilmentId);
        }
      }
      if (!current.ok) return current;
      if (current.value.state === "failed") {
        const refunded = await deps.fulfilmentEngine.refund(
          redemption.fulfilmentId,
          "fulfilment_failed",
        );
        if (refunded.ok) current = ok(refunded.value.fulfilment);
      }
      if (!current.ok) return current;
      return ok({ redemption, fulfilment: current.value });
    },
  };
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
export type { CatalogItem, RedeemRewardCommand, RedeemRewardResult };
