import { isPartnerBusinessCategory } from "@/contracts/partnerBusinessCategory";
import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import { platformRoute } from "@/lib/http/platformRoute";
import { isRiderOwnedApiPath } from "@/lib/pathMatch";
import { createWalletQueries } from "@/features/wallet/application/queries/walletQueries";
import type { CatalogItem } from "@/features/rewards/application/contracts/RedeemRewardCommand";
import {
  createCatalogQueries,
  createInMemoryCatalogListPort,
  type RedemptionListPort,
  createRedemptionQueries,
} from "@/features/rewards/application/queries/catalogAndRedemptions";
import {
  createFulfilmentQueries,
  createInMemoryFulfilmentQueryPort,
} from "@/features/fulfilment/application/queries/fulfilmentQueries";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";
import { createAggregateBackedFulfilmentQueryPort } from "@/features/fulfilment/infrastructure/aggregateBackedFulfilmentQueryPort";
import {
  createPartnerQueries,
} from "@/features/partners/application/partnerServices";
import {
  createOrganisationOpsCommands,
  createOrganisationOpsQueries,
  getSharedOrganisationOpsStore,
  type OrganisationListPort,
} from "@/features/organisations/application/organisationOps";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import { isMembershipRole } from "@/features/organisations/domain/CapabilityCatalog";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RouteParams = { id: string };

export type PlatformApiHandlers = {
  rewards: {
    catalog: (request: Request) => Promise<Response>;
    catalogById: (request: Request, params: RouteParams) => Promise<Response>;
    redeem: (request: Request) => Promise<Response>;
    redemptions: (request: Request) => Promise<Response>;
    redemptionById: (
      request: Request,
      params: RouteParams,
    ) => Promise<Response>;
  };
  wallet: {
    statement: (request: Request) => Promise<Response>;
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
    retry: (request: Request, params: RouteParams) => Promise<Response>;
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
    update: (request: Request, params: RouteParams) => Promise<Response>;
    listStaff: (request: Request, params: RouteParams) => Promise<Response>;
    addStaff: (request: Request, params: RouteParams) => Promise<Response>;
    updateStaff: (request: Request, params: RouteParams) => Promise<Response>;
  };
};

export type PlatformApiHooks = {
  onStaffAccessChanged?: (input: {
    change: "access_granted" | "role_changed";
    organisationId: string;
    userId: string;
    membershipId: string;
    role: import("@/features/organisations/domain/CapabilityCatalog").MembershipRole;
    version: string;
  }) => Promise<void>;
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
    fulfilments?: import("@/features/fulfilment/domain/Fulfilment").Fulfilment[];
  };
  hooks?: PlatformApiHooks;
  /** Shared fulfilment composition (API + jobs). When omitted and seed is set, a module is composed inline. */
  production?: boolean;
  ledger?: import("@/features/wallet/application/contracts/WalletReadPort").LedgerRepository;
  fulfilmentPort?: import("@/features/fulfilment/application/queries/fulfilmentQueries").FulfilmentQueryPort;
  /** Durable org store in production; defaults to in-memory for tests. */
  organisationStore?: OrganisationListPort;
};

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
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

  const isProductionComposition = options.production === true;
  let ledger: import("@/features/wallet/application/contracts/WalletReadPort").LedgerRepository = options.ledger ?? { getBalance: async () => { throw new Error("Wallet read port required"); }, listEntries: async () => { throw new Error("Wallet read port required"); } };
  let catalogPort: import("@/features/rewards/application/queries/catalogAndRedemptions").CatalogListPort = createInMemoryCatalogListPort(options.seed?.catalog ?? []);
  let redemptionPort: RedemptionListPort = { findById: async () => null, listByRider: async () => [] };
  let fulfilmentPort = options.fulfilmentPort ?? createInMemoryFulfilmentQueryPort(options.seed?.fulfilments ?? []);
  let listResourcesFn: ((filter: { partnerOrgId?: string | null }) => Promise<Array<{id:string;name:string;resourceKind:string;status:string;partnerOrgId:string|null;availableCount:number}>>) | undefined;
  if (isProductionComposition) {
    const { createSupabaseCatalogRepository } = await import("@/features/rewards/infrastructure/supabaseCatalogRepository");
    const { createSupabaseRedemptionRepository } = await import("@/features/rewards/infrastructure/supabaseRedemptionRepository");
    const { createSupabaseLedgerRepository } = await import("@/features/wallet/infrastructure/supabaseLedgerRepository");
    const { createSupabaseFulfilmentAggregateStore } = await import("@/features/fulfilment/infrastructure/supabaseFulfilmentAggregateStore");
    const { listFulfilmentResources } = await import("@/features/fulfilment/infrastructure/supabaseVoucherPoolResourceProvider");
    catalogPort = createSupabaseCatalogRepository();
    redemptionPort = createSupabaseRedemptionRepository();
    ledger = createSupabaseLedgerRepository();
    fulfilmentPort = createAggregateBackedFulfilmentQueryPort({ store: createSupabaseFulfilmentAggregateStore() });
    listResourcesFn = listFulfilmentResources;
  }
  const walletQueries = createWalletQueries({ authorisation, ledger });
  const catalogQueries = createCatalogQueries({ authorisation, catalog: catalogPort });
  const redemptionQueries = createRedemptionQueries({ authorisation, redemptions: redemptionPort });
  const fulfilmentQueries = createFulfilmentQueries({ authorisation, port: fulfilmentPort });
  const organisationStore = options.organisationStore ?? getSharedOrganisationOpsStore();
  const partnerQueries = createPartnerQueries({ authorisation, listFulfilments: () => fulfilmentPort.list(), listResources: listResourcesFn,
    listCatalog: () => catalogPort.list(), listStaffByOrg: id => organisationStore.listMembersByOrganisation(id), getOrganisation: id => organisationStore.findOrganisationById(id) });
  const organisationQueries = createOrganisationOpsQueries({ authorisation, store: organisationStore });
  const organisationCommands = createOrganisationOpsCommands({ authorisation, store: organisationStore });

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
      preferRider: (capability === "wallet.read" && !new URL(request.url).searchParams.has("riderId")) ||
        isRiderOwnedApiPath(new URL(request.url).pathname),
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
      redeem: request => route(request, "rewards.redeem", async () => fail("unavailable", "Lifecycle command adapter required")),
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
      statement: (request) =>
        route(request, "wallet.read", (ctx) => walletQueries.getStatement(ctx, new URL(request.url).searchParams.get("riderId") ?? undefined)),
      balance: (request) =>
        route(request, "wallet.read", (ctx) => walletQueries.getBalance(ctx, new URL(request.url).searchParams.get("riderId") ?? undefined)),
      transactions: (request) =>
        route(request, "wallet.read", (ctx) =>
          walletQueries.listTransactions(ctx, new URL(request.url).searchParams.get("riderId") ?? undefined, { cursor: new URL(request.url).searchParams.get("cursor") ?? undefined, asOf: new URL(request.url).searchParams.get("asOf") ?? undefined }),
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
      cancel: request => route(request, "fulfilment.cancel", async () => fail("unavailable", "Lifecycle command adapter required")),
      refund: request => route(request, "fulfilment.refund", async () => fail("unavailable", "Lifecycle command adapter required")),
      confirmCollection: request => route(request, "fulfilment.confirm", async () => fail("unavailable", "Lifecycle command adapter required")),
      consumeToken: request => route(request, "fulfilment.validate", async () => fail("unavailable", "Lifecycle command adapter required")),
      retry: request => route(request, "fulfilment.cancel", async () => fail("unavailable", "Lifecycle command adapter required")),
    },
    partners: {
      me: (request) =>
        route(request, "fulfilment.read", (ctx) => partnerQueries.me(ctx)),
      pending: (request) =>
        route(request, "fulfilment.read", (ctx) =>
          partnerQueries.pendingFulfilments(ctx),
        ),
      validate: request => route(request, "fulfilment.validate", async () => fail("unavailable", "Lifecycle command adapter required")),
      confirmCollection: request => route(request, "fulfilment.confirm", async () => fail("unavailable", "Lifecycle command adapter required")),
      resources: request => route(request, "resources.manage", ctx => partnerQueries.listResources(ctx)),
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
            operationId: typeof body.operationId === "string" ? body.operationId : undefined,
            name,
            type: type as Organisation["type"],
          });
        }),
      get: (request, params) =>
        route(request, "rewards.manage", (ctx) =>
          organisationQueries.getById(ctx, params.id),
        ),
      update: (request, params) =>
        route(request, "rewards.manage", async (ctx, req) => {
          const body = await readJsonBody(req);
          const name = typeof body.name === "string" ? body.name : undefined;
          const status =
            body.status === "active" ||
            body.status === "inactive" ||
            body.status === "suspended"
              ? body.status
              : undefined;
          const partnerRaw =
            body.partnerProfile && typeof body.partnerProfile === "object"
              ? (body.partnerProfile as Record<string, unknown>)
              : null;
          if (partnerRaw && "businessCategory" in partnerRaw && partnerRaw.businessCategory !== null && !isPartnerBusinessCategory(partnerRaw.businessCategory)) {
            return fail("validation", "Invalid business category");
          }
          const partnerProfile = partnerRaw
            ? {
                businessCategory: partnerRaw.businessCategory === null ? null : isPartnerBusinessCategory(partnerRaw.businessCategory) ? partnerRaw.businessCategory : undefined,
                contactEmail:
                  partnerRaw.contactEmail === null
                    ? null
                    : typeof partnerRaw.contactEmail === "string"
                      ? partnerRaw.contactEmail
                      : undefined,
                website:
                  partnerRaw.website === null
                    ? null
                    : typeof partnerRaw.website === "string"
                      ? partnerRaw.website
                      : undefined,
                logoUrl:
                  partnerRaw.logoUrl === null
                    ? null
                    : typeof partnerRaw.logoUrl === "string"
                      ? partnerRaw.logoUrl
                      : undefined,
              }
            : undefined;
          if (
            name === undefined &&
            status === undefined &&
            partnerProfile === undefined
          ) {
            return fail("validation", "No organisation fields to update");
          }
          return organisationCommands.update(ctx, {
            id: params.id,
            name,
            status,
            partnerProfile,
          });
        }),
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
          const result = await organisationCommands.addStaff(ctx, {
            organisationId: params.id,
            userId,
            role,
          });
          if (result.ok && options.hooks?.onStaffAccessChanged) {
            try {
              await options.hooks.onStaffAccessChanged({
                change: "access_granted",
                organisationId: params.id,
                userId: result.value.userId,
                membershipId: result.value.id,
                role: result.value.role,
                version: result.value.updatedAt,
              });
            } catch (error) {
              console.error("Staff access notification hook failed", {
                membershipId: result.value.id,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }
          return result;
        }),
      updateStaff: (request, params) =>
        route(request, "staff.manage", async (ctx, req) => {
          const body = await readJsonBody(req);
          const membershipId =
            typeof body.membershipId === "string" ? body.membershipId : "";
          if (body.status !== undefined && body.status !== "active" && body.status !== "invited" && body.status !== "revoked") return fail("validation", "Invalid membership status");
          const role = typeof body.role === "string" ? body.role : "";
          if (!isMembershipRole(role)) {
            return fail("validation", "Valid membership role is required");
          }
          const result = await organisationCommands.updateStaffRole(ctx, {
            organisationId: params.id,
            membershipId,
            expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined,
            status: body.status === "active" || body.status === "invited" || body.status === "revoked" ? body.status : undefined,
            role,
          });
          if (result.ok && options.hooks?.onStaffAccessChanged) {
            try {
              await options.hooks.onStaffAccessChanged({
                change: "role_changed",
                organisationId: params.id,
                userId: result.value.userId,
                membershipId: result.value.id,
                role: result.value.role,
                version: result.value.updatedAt,
              });
            } catch (error) {
              console.error("Staff access notification hook failed", {
                membershipId: result.value.id,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }
          return result;
        }),
    },
  };
}
