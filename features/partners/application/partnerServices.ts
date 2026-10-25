import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
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
  thumbnailUrl?: string | null;
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
  fulfilmentHistory: (ctx: RequestContext) => Promise<ApplicationResult<unknown[]>>;
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
  ) => Promise<ApplicationResult<unknown>>;
  confirmCollection: (
    ctx: RequestContext,
    input: { fulfilmentId: string },
  ) => Promise<ApplicationResult<unknown>>;
};

/** Partner-actionable fulfilment states for pending queue. */
const PENDING_PARTNER_STATES = new Set<FulfilmentState>([
  "ready",
  "awaiting_collection",
  "validated",
  "reserved",
]);

const HISTORY_PARTNER_STATES = new Set<FulfilmentState>(["collected","dispatched","delivered","completed","cancelled","failed","expired","refunded","reversed"]);

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
  listCatalogForOrg?: (organisationId: string) => Promise<CatalogItem[]>;
  listStaffByOrg?: (
    organisationId: string,
  ) => Promise<OrganisationMembership[]>;
  getOrganisation?: (organisationId: string) => Promise<Organisation | null>;
}): PartnerQueries {
  async function scopedFulfilments(ctx: RequestContext, history: boolean): Promise<ApplicationResult<unknown[]>> {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      if (!deps.listFulfilments) return ok([]);
      const rows = await deps.listFulfilments();
      const catalog = deps.listCatalogForOrg ? await deps.listCatalogForOrg(org.value.organisationId) : await deps.listCatalog?.() ?? [];
      const titles = new Map(catalog.filter(item => item.partnerOrgId === org.value.organisationId).map(item => [item.id, item.title]));
      return ok(
        rows.filter(
          (f) =>
            f.partnerOrgId === org.value.organisationId &&
            (history ? HISTORY_PARTNER_STATES.has(f.state) : PENDING_PARTNER_STATES.has(f.state)),
        ).map(f => ({ ...f, rewardTitle: titles.get(f.catalogItemId) })),
      );
  }
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
    pendingFulfilments: ctx => scopedFulfilments(ctx, false),
    fulfilmentHistory: ctx => scopedFulfilments(ctx, true),
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
      if (scope.value.organisationId && deps.listCatalogForOrg) return ok(await deps.listCatalogForOrg(scope.value.organisationId));
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
