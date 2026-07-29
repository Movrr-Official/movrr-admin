import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import { platformRoute } from "@/lib/http/platformRoute";
import { DomainEventBus } from "@/lib/events/DomainEventBus";
import { createFraudPolicyEngine } from "@/features/fraud/application/commands/fraudPolicyEngine";
import { createInMemoryIdempotencyStore } from "@/features/fraud/infrastructure/policies/idempotency";
import { createInMemoryReplayStore } from "@/features/fraud/infrastructure/policies/replay";
import { createInMemoryRateLimitStore } from "@/features/fraud/infrastructure/policies/rateLimit";
import { createInMemoryLedgerRepository } from "@/features/wallet/infrastructure/ledgerRepository";
import { createWalletQueries } from "@/features/wallet/application/queries/walletQueries";
import {
  createRedeemRewardService,
  type CatalogItem,
} from "@/features/rewards/application/commands/redeemReward";
import {
  createCatalogQueries,
  createInMemoryCatalogListPort,
  createInMemoryRedemptionListPort,
  createRedemptionQueries,
} from "@/features/rewards/application/queries/catalogAndRedemptions";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import type { TokenService } from "@/features/fulfilment/application/commands/tokenService";
import {
  createFulfilmentQueries,
  createInMemoryFulfilmentQueryPort,
} from "@/features/fulfilment/application/queries/fulfilmentQueries";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";
import {
  createPartnerCommands,
  createPartnerQueries,
} from "@/features/partners/application/partnerServices";
import type { FulfilmentModule } from "@/features/fulfilment/infrastructure/composeFulfilmentModule";
import { composeFulfilmentModule } from "@/features/fulfilment/infrastructure/composeFulfilmentModule";
import {
  createOrganisationOpsCommands,
  createOrganisationOpsQueries,
  getSharedOrganisationOpsStore,
  type OrganisationListPort,
} from "@/features/organisations/application/organisationOps";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import { isMembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

export type RouteParams = { id: string };

export type PlatformApiHandlers = {
  rewards: {
    catalog: (request: Request) => Promise<Response>;
    catalogById: (request: Request, params: RouteParams) => Promise<Response>;
    redeem: (request: Request) => Promise<Response>;
    redemptions: (request: Request) => Promise<Response>;
    redemptionById: (request: Request, params: RouteParams) => Promise<Response>;
  };
  wallet: {
    balance: (request: Request) => Promise<Response>;
    transactions: (request: Request) => Promise<Response>;
  };
  fulfilment: {
    list: (request: Request) => Promise<Response>;
    get: (request: Request, params: RouteParams) => Promise<Response>;
    timeline: (request: Request, params: RouteParams) => Promise<Response>;
    token: (request: Request, params: RouteParams) => Promise<Response>;
    cancel: (request: Request, params: RouteParams) => Promise<Response>;
    refund: (request: Request, params: RouteParams) => Promise<Response>;
    confirmCollection: (
      request: Request,
      params: RouteParams,
    ) => Promise<Response>;
    consumeToken: (request: Request) => Promise<Response>;
  };
  partners: {
    me: (request: Request) => Promise<Response>;
    pending: (request: Request) => Promise<Response>;
    validate: (request: Request) => Promise<Response>;
    confirmCollection: (request: Request) => Promise<Response>;
    resources: (request: Request) => Promise<Response>;
    rewards: (request: Request) => Promise<Response>;
    staff: (request: Request) => Promise<Response>;
    analytics: (request: Request) => Promise<Response>;
    settings: (request: Request) => Promise<Response>;
  };
  organisations: {
    list: (request: Request) => Promise<Response>;
    create: (request: Request) => Promise<Response>;
    get: (request: Request, params: RouteParams) => Promise<Response>;
    listStaff: (request: Request, params: RouteParams) => Promise<Response>;
    addStaff: (request: Request, params: RouteParams) => Promise<Response>;
    updateStaff: (request: Request, params: RouteParams) => Promise<Response>;
  };
};

export type PlatformApiHooks = {
  onFulfilmentCancel?: (
    ctx: RequestContext,
    input: { id: string; reason: string },
  ) => Promise<ApplicationResult<unknown>>;
  onFulfilmentRefund?: (
    ctx: RequestContext,
    input: { id: string; reason: string },
  ) => Promise<ApplicationResult<unknown>>;
  onFulfilmentConfirm?: (
    ctx: RequestContext,
    input: { id: string },
  ) => Promise<ApplicationResult<unknown>>;
  onConsumeToken?: (
    ctx: RequestContext,
    input: { token: string },
  ) => Promise<ApplicationResult<unknown>>;
};

export type CreatePlatformApiOptions = {
  authDeps: AuthenticateRequestDeps;
  seed?: {
    balance?: number;
    catalog?: CatalogItem[];
  };
  hooks?: PlatformApiHooks;
  /** Shared fulfilment composition (API + jobs). When omitted and seed is set, a module is composed inline. */
  fulfilmentModule?: FulfilmentModule;
  /** Durable org store in production; defaults to in-memory for tests. */
  organisationStore?: OrganisationListPort;
};

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      return body as Record<string, unknown>;
    }
  } catch {
    // empty / invalid
  }
  return {};
}

/**
 * Test/composition factory wiring AuthN + AuthZ + application services into
 * thin HTTP handlers. Production route modules call the same handler builders.
 */
export async function createPlatformApiForTests(
  options: CreatePlatformApiOptions,
): Promise<PlatformApiHandlers> {
  const authDeps = options.authDeps;
  const authorisation = authorisationService;

  let fulfilmentModule = options.fulfilmentModule ?? null;
  if (!fulfilmentModule && options.seed) {
    fulfilmentModule = composeFulfilmentModule();
  }

  const bus = fulfilmentModule?.bus ?? new DomainEventBus();
  const ledger =
    fulfilmentModule?.ledger ?? createInMemoryLedgerRepository();
  const catalogPort = createInMemoryCatalogListPort(options.seed?.catalog ?? []);
  const redemptionPort = createInMemoryRedemptionListPort();
  const fulfilmentPort = createInMemoryFulfilmentQueryPort([
    createFulfilment({
      id: "f-1",
      redemptionId: "red-1",
      riderId: "rider-1",
      catalogItemId: "cat-1",
      fulfilmentType: "instant_digital",
      state: "ready",
      version: 1,
      partnerOrgId: "org-1",
      idempotencyKey: "seed-f-1",
    }),
  ]);

  const walletQueries = createWalletQueries({ authorisation, ledger });
  const catalogQueries = createCatalogQueries({
    authorisation,
    catalog: catalogPort,
  });
  const redemptionQueries = createRedemptionQueries({
    authorisation,
    redemptions: redemptionPort,
  });
  const fulfilmentQueries = createFulfilmentQueries({
    authorisation,
    port: fulfilmentPort,
  });
  const partnerQueries = createPartnerQueries({ authorisation });
  const partnerCommands = createPartnerCommands({ authorisation });
  const organisationStore =
    options.organisationStore ?? getSharedOrganisationOpsStore();
  const organisationQueries = createOrganisationOpsQueries({
    authorisation,
    store: organisationStore,
  });
  const organisationCommands = createOrganisationOpsCommands({
    authorisation,
    store: organisationStore,
  });

  let redeemService: ReturnType<typeof createRedeemRewardService> | null = null;
  let fulfilmentEngine: FulfilmentEngine | null =
    fulfilmentModule?.engine ?? null;
  let tokenService: TokenService | null =
    fulfilmentModule?.tokens ?? null;

  if (options.seed && fulfilmentModule) {
    const seedable = ledger as typeof ledger & {
      seedBalance?: (riderId: string, points: number) => Promise<void>;
    };
    if (seedable.seedBalance) {
      await seedable.seedBalance("rider-1", options.seed.balance ?? 100);
    }
    await fulfilmentModule.pool.seedPool("res-pool-1", [
      { id: "item-1", code: "VOUCHER-1" },
    ]);

    const fraud = createFraudPolicyEngine({
      idempotency: createInMemoryIdempotencyStore(),
      replay: createInMemoryReplayStore(),
      rateLimit: createInMemoryRateLimitStore({ max: 100, windowMs: 60_000 }),
    });
    redeemService = createRedeemRewardService({
      authorisation,
      fraud,
      catalog: catalogPort,
      settlement: fulfilmentModule.settlement,
      redemptions: redemptionPort,
      fulfilmentEngine: fulfilmentModule.engine,
      eventBus: bus,
    });
  }

  const route = <T>(
    request: Request,
    capability: string,
    handle: (
      ctx: RequestContext,
      request: Request,
    ) => Promise<ApplicationResult<T>>,
  ) =>
    platformRoute({
      request,
      capability,
      authDeps,
      authorisation,
      handle,
    });

  return {
    rewards: {
      catalog: (request) =>
        route(request, "rewards.catalog.read", (ctx) =>
          catalogQueries.list(ctx),
        ),
      catalogById: (request, params) =>
        route(request, "rewards.catalog.read", (ctx) =>
          catalogQueries.getById(ctx, params.id),
        ),
      redeem: (request) =>
        route(request, "rewards.redeem", async (ctx, req) => {
          const key = req.headers.get("Idempotency-Key")?.trim();
          if (!key) {
            return fail("validation", "Idempotency-Key header is required");
          }
          const body = await readJsonBody(req);
          const catalogItemId =
            typeof body.catalogItemId === "string" ? body.catalogItemId : "";
          if (!redeemService) {
            // Authz-only stub when catalog/ledger not seeded
            return ok({
              redemption: { id: "stub-redemption", catalogItemId },
              fulfilment: { id: "stub-fulfilment" },
            });
          }
          fulfilmentModule?.metrics.recordRedeemAttempt({
            correlationId: ctx.correlationId,
            catalogItemId,
          });
          const result = await redeemService.execute(ctx, {
            catalogItemId,
            idempotencyKey: key,
          });
          if (result.ok) {
            fulfilmentModule?.metrics.recordRedeemSuccess({
              correlationId: ctx.correlationId,
              fulfilmentId: result.value.fulfilment.id,
            });
            await bus.flushAfterCommit();
          } else {
            fulfilmentModule?.metrics.recordRedeemFailure({
              correlationId: ctx.correlationId,
              reason: result.kind,
            });
          }
          return result;
        }),
      redemptions: (request) =>
        route(request, "fulfilment.read", (ctx) =>
          redemptionQueries.listMine(ctx),
        ),
      redemptionById: (request, params) =>
        route(request, "fulfilment.read", (ctx) =>
          redemptionQueries.getById(ctx, params.id),
        ),
    },
    wallet: {
      balance: (request) =>
        route(request, "wallet.read", (ctx) => walletQueries.getBalance(ctx)),
      transactions: (request) =>
        route(request, "wallet.read", (ctx) =>
          walletQueries.listTransactions(ctx),
        ),
    },
    fulfilment: {
      list: (request) =>
        route(request, "fulfilment.read", (ctx) => {
          const url = new URL(request.url);
          return fulfilmentQueries.listForOps(ctx, {
            status: url.searchParams.get("status") ?? undefined,
            type: url.searchParams.get("type") ?? undefined,
            partnerOrgId: url.searchParams.get("partnerOrgId") ?? undefined,
          });
        }),
      get: (request, params) =>
        route(request, "fulfilment.read", (ctx) =>
          fulfilmentQueries.getById(ctx, params.id),
        ),
      timeline: (request, params) =>
        route(request, "fulfilment.read", (ctx) =>
          fulfilmentQueries.timeline(ctx, params.id),
        ),
      token: (request, params) =>
        route(request, "fulfilment.read", (ctx) =>
          fulfilmentQueries.getToken(ctx, params.id),
        ),
      cancel: (request, params) =>
        route(request, "fulfilment.cancel", async (ctx, req) => {
          const body = await readJsonBody(req);
          const reason =
            typeof body.reason === "string" ? body.reason : "cancelled";
          if (options.hooks?.onFulfilmentCancel) {
            return options.hooks.onFulfilmentCancel(ctx, {
              id: params.id,
              reason,
            });
          }
          if (fulfilmentEngine) {
            const result = await fulfilmentEngine.cancel(params.id, reason);
            if (result.ok) await bus.flushAfterCommit();
            return result;
          }
          return ok({ fulfilmentId: params.id, cancelled: true });
        }),
      refund: (request, params) =>
        route(request, "fulfilment.refund", async (ctx, req) => {
          const body = await readJsonBody(req);
          const reason =
            typeof body.reason === "string" ? body.reason : "refunded";
          if (options.hooks?.onFulfilmentRefund) {
            return options.hooks.onFulfilmentRefund(ctx, {
              id: params.id,
              reason,
            });
          }
          if (fulfilmentEngine) {
            const result = await fulfilmentEngine.refund(params.id, reason);
            if (result.ok) await bus.flushAfterCommit();
            return result;
          }
          return ok({ fulfilmentId: params.id, refunded: true });
        }),
      confirmCollection: (request, params) =>
        route(request, "fulfilment.confirm", async (ctx) => {
          if (options.hooks?.onFulfilmentConfirm) {
            return options.hooks.onFulfilmentConfirm(ctx, { id: params.id });
          }
          if (fulfilmentEngine) {
            const result = await fulfilmentEngine.confirmCollection(params.id);
            if (result.ok) await bus.flushAfterCommit();
            return result;
          }
          return ok({ fulfilmentId: params.id, confirmed: true });
        }),
      consumeToken: (request) =>
        route(request, "fulfilment.validate", async (ctx, req) => {
          const body = await readJsonBody(req);
          const token = typeof body.token === "string" ? body.token : "";
          if (options.hooks?.onConsumeToken) {
            return options.hooks.onConsumeToken(ctx, { token });
          }
          if (tokenService && fulfilmentEngine) {
            fulfilmentModule?.metrics.recordValidateAttempt({
              correlationId: ctx.correlationId,
            });
            const consumed = await tokenService.consume({
              plaintext: token,
              correlationId: ctx.correlationId,
            });
            if (!consumed.ok) {
              fulfilmentModule?.metrics.recordValidateFailure({
                correlationId: ctx.correlationId,
                reason: consumed.kind,
              });
              return consumed;
            }
            const result = await fulfilmentEngine.onTokenConsumed({
              fulfilmentId: consumed.value.fulfilmentId,
              token: consumed.value,
              correlationId: ctx.correlationId,
            });
            if (result.ok) {
              fulfilmentModule?.metrics.recordValidateSuccess({
                correlationId: ctx.correlationId,
                fulfilmentId: consumed.value.fulfilmentId,
              });
              await bus.flushAfterCommit();
            } else {
              fulfilmentModule?.metrics.recordValidateFailure({
                correlationId: ctx.correlationId,
                reason: result.kind,
              });
            }
            return result;
          }
          return ok({ consumed: true });
        }),
    },
    partners: {
      me: (request) =>
        route(request, "fulfilment.read", (ctx) => partnerQueries.me(ctx)),
      pending: (request) =>
        route(request, "fulfilment.read", (ctx) =>
          partnerQueries.pendingFulfilments(ctx),
        ),
      validate: (request) =>
        route(request, "fulfilment.validate", async (ctx, req) => {
          const body = await readJsonBody(req);
          const token = typeof body.token === "string" ? body.token : "";
          return partnerCommands.validate(ctx, { token });
        }),
      confirmCollection: (request) =>
        route(request, "fulfilment.confirm", async (ctx, req) => {
          const body = await readJsonBody(req);
          const fulfilmentId =
            typeof body.fulfilmentId === "string"
              ? body.fulfilmentId
              : "";
          return partnerCommands.confirmCollection(ctx, { fulfilmentId });
        }),
      resources: (request) =>
        route(
          request,
          "resources.manage",
          async (ctx, req): Promise<ApplicationResult<unknown>> => {
            if (req.method === "POST") {
              const key = req.headers.get("Idempotency-Key")?.trim();
              if (!key) {
                return fail("validation", "Idempotency-Key header is required");
              }
              const body = await readJsonBody(req);
              const resourceId =
                typeof body.resourceId === "string"
                  ? body.resourceId.trim()
                  : "";
              const codes = Array.isArray(body.codes)
                ? body.codes.filter(
                    (code): code is string =>
                      typeof code === "string" && code.trim().length > 0,
                  )
                : [];
              if (!resourceId) {
                return fail("validation", "resourceId is required");
              }
              // Empty-provider stub: authz + shape validation only (no pool mutation yet).
              return ok({
                resourceId,
                imported: codes.length,
                accepted: true,
              });
            }
            return partnerQueries.listResources(ctx);
          },
        ),
      rewards: (request) =>
        route(request, "rewards.catalog.read", (ctx) =>
          partnerQueries.listRewards(ctx),
        ),
      staff: (request) =>
        route(request, "staff.manage", (ctx) => partnerQueries.listStaff(ctx)),
      analytics: (request) =>
        route(request, "analytics.view", (ctx) =>
          partnerQueries.analytics(ctx),
        ),
      settings: (request) =>
        route(request, "fulfilment.read", (ctx) =>
          partnerQueries.settings(ctx),
        ),
    },
    organisations: {
      list: (request) =>
        route(request, "rewards.manage", (ctx) => {
          const url = new URL(request.url);
          const type = url.searchParams.get("type");
          return organisationQueries.list(ctx, {
            type:
              type === "reward_partner" ||
              type === "advertiser" ||
              type === "government" ||
              type === "movrr"
                ? type
                : undefined,
          });
        }),
      create: (request) =>
        route(request, "rewards.manage", async (ctx, req) => {
          const body = await readJsonBody(req);
          const name = typeof body.name === "string" ? body.name : "";
          const type = body.type;
          if (
            type !== "reward_partner" &&
            type !== "advertiser" &&
            type !== "government" &&
            type !== "movrr"
          ) {
            return fail("validation", "Valid organisation type is required");
          }
          return organisationCommands.create(ctx, {
            name,
            type: type as Organisation["type"],
          });
        }),
      get: (request, params) =>
        route(request, "rewards.manage", (ctx) =>
          organisationQueries.getById(ctx, params.id),
        ),
      listStaff: (request, params) =>
        route(request, "staff.manage", (ctx) =>
          organisationQueries.listStaff(ctx, params.id),
        ),
      addStaff: (request, params) =>
        route(request, "staff.manage", async (ctx, req) => {
          const body = await readJsonBody(req);
          const userId = typeof body.userId === "string" ? body.userId : "";
          const role = typeof body.role === "string" ? body.role : "";
          if (!isMembershipRole(role)) {
            return fail("validation", "Valid membership role is required");
          }
          return organisationCommands.addStaff(ctx, {
            organisationId: params.id,
            userId,
            role,
          });
        }),
      updateStaff: (request, params) =>
        route(request, "staff.manage", async (ctx, req) => {
          const body = await readJsonBody(req);
          const membershipId =
            typeof body.membershipId === "string" ? body.membershipId : "";
          const role = typeof body.role === "string" ? body.role : "";
          if (!isMembershipRole(role)) {
            return fail("validation", "Valid membership role is required");
          }
          return organisationCommands.updateStaffRole(ctx, {
            organisationId: params.id,
            membershipId,
            role,
          });
        }),
    },
  };
}
