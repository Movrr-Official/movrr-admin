import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import type { TokenService } from "@/features/fulfilment/application/commands/tokenService";
import type { FulfilmentHandlerResult } from "@/features/fulfilment/application/contracts/FulfilmentHandler";
import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import type { CatalogItem } from "@/features/rewards/application/contracts/RedeemRewardCommand";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { Organisation } from "@/features/organisations/domain/Organisation";

export type PartnerProfileReadModel = {
  organisationId: string;
  role: string | null;
  type: "reward_partner";
};

export type PartnerResourceReadModel = {
  id: string;
  name: string;
  resourceKind: string;
  status: string;
  partnerOrgId: string | null;
  availableCount: number;
};

export type PartnerQueries = {
  me: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<PartnerProfileReadModel>>;
  pendingFulfilments: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<unknown[]>>;
  listResources: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<unknown[]>>;
  listRewards: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<unknown[]>>;
  listStaff: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<unknown[]>>;
  analytics: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<{ series: unknown[] }>>;
  settings: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<Record<string, unknown>>>;
};

export type PartnerCommands = {
  validate: (
    ctx: RequestContext,
    input: { token: string },
  ) => Promise<ApplicationResult<FulfilmentHandlerResult | { validated: true }>>;
  confirmCollection: (
    ctx: RequestContext,
    input: { fulfilmentId: string },
  ) => Promise<ApplicationResult<FulfilmentHandlerResult | { confirmed: true }>>;
};

/** Partner-actionable fulfilment states for pending queue. */
const PENDING_PARTNER_STATES = new Set<FulfilmentState>([
  "ready",
  "awaiting_collection",
  "validated",
  "reserved",
]);

function requireOrg(ctx: RequestContext): ApplicationResult<{
  organisationId: string;
  role: string | null;
}> {
  if (ctx.principal.type !== "organisation") {
    return fail(
      "BusinessFailure",
      "Partner endpoints require an organisation principal",
    );
  }
  return ok({
    organisationId: ctx.principal.organisationId,
    role: ctx.principal.role ?? null,
  });
}

/** Admin ops may call partner list endpoints; empty read models until tenant-scoped data exists. */
function allowPartnerOrAdminList(
  ctx: RequestContext,
): ApplicationResult<{ organisationId: string | null; role: string | null }> {
  if (ctx.principal.type === "admin") {
    return ok({ organisationId: null, role: ctx.principal.role });
  }
  const org = requireOrg(ctx);
  if (!org.ok) return org;
  return ok(org.value);
}

export function createPartnerQueries(deps: {
  authorisation: AuthorisationService;
  /** When set, pending list filters durable fulfilments for the partner org. */
  listFulfilments?: () => Promise<Fulfilment[]>;
  listResources?: (filter: {
    partnerOrgId?: string | null;
  }) => Promise<PartnerResourceReadModel[]>;
  listCatalog?: () => Promise<CatalogItem[]>;
  listStaffByOrg?: (
    organisationId: string,
  ) => Promise<OrganisationMembership[]>;
  getOrganisation?: (organisationId: string) => Promise<Organisation | null>;
}): PartnerQueries {
  return {
    async me(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok({
        organisationId: org.value.organisationId,
        role: org.value.role,
        type: "reward_partner" as const,
      });
    },
    async pendingFulfilments(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      if (!deps.listFulfilments) return ok([]);
      const rows = await deps.listFulfilments();
      return ok(
        rows.filter(
          (f) =>
            f.partnerOrgId === org.value.organisationId &&
            PENDING_PARTNER_STATES.has(f.state),
        ),
      );
    },
    async listResources(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "resources.manage");
      if (!authz.ok) return authz;
      const scope = allowPartnerOrAdminList(ctx);
      if (!scope.ok) return scope;
      if (!deps.listResources) return ok([]);
      return ok(
        await deps.listResources({
          partnerOrgId: scope.value.organisationId,
        }),
      );
    },
    async listRewards(ctx) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "rewards.catalog.read",
      );
      if (!authz.ok) return authz;
      const scope = allowPartnerOrAdminList(ctx);
      if (!scope.ok) return scope;
      if (!deps.listCatalog) return ok([]);
      const items = await deps.listCatalog();
      if (!scope.value.organisationId) return ok(items);
      return ok(
        items.filter(
          (item) => item.partnerOrgId === scope.value.organisationId,
        ),
      );
    },
    async listStaff(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "staff.manage");
      if (!authz.ok) return authz;
      const scope = allowPartnerOrAdminList(ctx);
      if (!scope.ok) return scope;
      if (!scope.value.organisationId || !deps.listStaffByOrg) return ok([]);
      return ok(await deps.listStaffByOrg(scope.value.organisationId));
    },
    async analytics(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "analytics.view");
      if (!authz.ok) return authz;
      const scope = allowPartnerOrAdminList(ctx);
      if (!scope.ok) return scope;
      if (!deps.listFulfilments) return ok({ series: [] });
      const rows = await deps.listFulfilments();
      const scoped = scope.value.organisationId
        ? rows.filter((f) => f.partnerOrgId === scope.value.organisationId)
        : rows;
      const byState = new Map<string, number>();
      for (const row of scoped) {
        byState.set(row.state, (byState.get(row.state) ?? 0) + 1);
      }
      return ok({
        series: [...byState.entries()].map(([state, count]) => ({
          state,
          count,
        })),
      });
    },
    async settings(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const scope = allowPartnerOrAdminList(ctx);
      if (!scope.ok) return scope;
      if (!scope.value.organisationId || !deps.getOrganisation) {
        return ok({});
      }
      const org = await deps.getOrganisation(scope.value.organisationId);
      if (!org) return ok({});
      return ok({
        organisationId: org.id,
        name: org.name,
        type: org.type,
        status: org.status,
      });
    },
  };
}

export function createPartnerCommands(deps: {
  authorisation: AuthorisationService;
  tokens?: TokenService;
  engine?: FulfilmentEngine;
  /** When true, missing tokens/engine fails instead of stub success (production). */
  requireEngine?: boolean;
}): PartnerCommands {
  return {
    async validate(ctx, input) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "fulfilment.validate",
      );
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;

      if (!deps.tokens || !deps.engine) {
        if (deps.requireEngine) {
          return fail(
            "unavailable",
            "Partner validate requires fulfilment engine",
          );
        }
        return ok({ validated: true });
      }
      if (!input.token) {
        return fail("validation", "token is required");
      }
      const consumed = await deps.tokens.consume({
        plaintext: input.token,
        correlationId: ctx.correlationId,
      });
      if (!consumed.ok) return consumed;
      return deps.engine.onTokenConsumed({
        fulfilmentId: consumed.value.fulfilmentId,
        token: consumed.value,
        correlationId: ctx.correlationId,
      });
    },

    async confirmCollection(ctx, input) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "fulfilment.confirm",
      );
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;

      if (!deps.engine) {
        if (deps.requireEngine) {
          return fail(
            "unavailable",
            "Partner confirm requires fulfilment engine",
          );
        }
        return ok({ confirmed: true });
      }
      if (!input.fulfilmentId) {
        return fail("validation", "fulfilmentId is required");
      }
      return deps.engine.confirmCollection(input.fulfilmentId);
    },
  };
}
