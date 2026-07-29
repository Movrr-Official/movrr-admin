import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type { FulfilmentEngine } from "@/features/fulfilment/application/FulfilmentEngine";
import type { TokenService } from "@/features/fulfilment/application/commands/tokenService";
import type { FulfilmentHandlerResult } from "@/features/fulfilment/application/contracts/FulfilmentHandler";

export type PartnerProfileReadModel = {
  organisationId: string;
  role: string | null;
  type: "reward_partner";
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

export function createPartnerQueries(deps: {
  authorisation: AuthorisationService;
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
      return ok([]);
    },
    async listResources(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "resources.manage");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok([]);
    },
    async listRewards(ctx) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "rewards.catalog.read",
      );
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok([]);
    },
    async listStaff(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "staff.manage");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok([]);
    },
    async analytics(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "analytics.view");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok({ series: [] });
    },
    async settings(ctx) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const org = requireOrg(ctx);
      if (!org.ok) return org;
      return ok({});
    },
  };
}

export function createPartnerCommands(deps: {
  authorisation: AuthorisationService;
  tokens?: TokenService;
  engine?: FulfilmentEngine;
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
        return ok({ confirmed: true });
      }
      if (!input.fulfilmentId) {
        return fail("validation", "fulfilmentId is required");
      }
      return deps.engine.confirmCollection(input.fulfilmentId);
    },
  };
}
