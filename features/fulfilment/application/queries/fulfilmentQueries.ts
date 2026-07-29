import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type {
  Fulfilment,
  FulfilmentEvent,
  FulfilmentType,
} from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import { deriveProgress, type RiderProgress } from "@/features/fulfilment/domain/progress";
import type { FulfilmentOutcome } from "@/features/fulfilment/domain/outcome";

export type FulfilmentReadModel = {
  id: string;
  redemptionId: string;
  riderId: string;
  catalogItemId: string;
  fulfilmentType: FulfilmentType;
  state: FulfilmentState;
  outcome: FulfilmentOutcome | null;
  progress: RiderProgress;
  version: number;
  partnerOrgId: string | null;
  expiresAt: string | null;
  completedAt: string | null;
};

export type TokenDisplayReadModel = {
  fulfilmentId: string;
  tokenType: string;
  status: string;
  /** Display hint only — never the raw secret hash. */
  displayHint: string;
  expiresAt: string | null;
};

export type FulfilmentQueryPort = {
  findById: (id: string) => Promise<Fulfilment | null>;
  list: (filter?: {
    status?: string;
    type?: string;
    partnerOrgId?: string;
  }) => Promise<Fulfilment[]>;
  listEvents: (fulfilmentId: string) => Promise<FulfilmentEvent[]>;
  findTokenDisplay: (
    fulfilmentId: string,
  ) => Promise<TokenDisplayReadModel | null>;
};

export type FulfilmentQueries = {
  getById: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<FulfilmentReadModel>>;
  listForOps: (
    ctx: RequestContext,
    filter?: { status?: string; type?: string },
  ) => Promise<ApplicationResult<FulfilmentReadModel[]>>;
  timeline: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<FulfilmentEvent[]>>;
  getToken: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<TokenDisplayReadModel>>;
};

function toReadModel(f: Fulfilment): FulfilmentReadModel {
  return {
    id: f.id,
    redemptionId: f.redemptionId,
    riderId: f.riderId,
    catalogItemId: f.catalogItemId,
    fulfilmentType: f.fulfilmentType,
    state: f.state,
    outcome: f.outcome,
    progress: deriveProgress(f.state),
    version: f.version,
    partnerOrgId: f.partnerOrgId,
    expiresAt: f.expiresAt,
    completedAt: f.completedAt,
  };
}

function canViewFulfilment(ctx: RequestContext, f: Fulfilment): boolean {
  if (ctx.principal.type === "admin") return true;
  if (ctx.principal.type === "rider") {
    return f.riderId === ctx.principal.riderId;
  }
  if (ctx.principal.type === "organisation") {
    return f.partnerOrgId === ctx.principal.organisationId;
  }
  return false;
}

export function createFulfilmentQueries(deps: {
  authorisation: AuthorisationService;
  port: FulfilmentQueryPort;
}): FulfilmentQueries {
  return {
    async getById(ctx, id) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const row = await deps.port.findById(id);
      if (!row) return fail("not_found", `Fulfilment ${id} not found`);
      if (!canViewFulfilment(ctx, row)) {
        return fail("permission_denied", "Fulfilment not visible to principal");
      }
      return ok(toReadModel(row));
    },

    async listForOps(ctx, filter) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const rows = await deps.port.list(filter);
      const visible = rows.filter((f) => canViewFulfilment(ctx, f));
      return ok(visible.map(toReadModel));
    },

    async timeline(ctx, id) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const row = await deps.port.findById(id);
      if (!row) return fail("not_found", `Fulfilment ${id} not found`);
      if (!canViewFulfilment(ctx, row)) {
        return fail("permission_denied", "Fulfilment not visible to principal");
      }
      return ok(await deps.port.listEvents(id));
    },

    async getToken(ctx, id) {
      const authz = deps.authorisation.assertCapability(ctx, "fulfilment.read");
      if (!authz.ok) return authz;
      const row = await deps.port.findById(id);
      if (!row) return fail("not_found", `Fulfilment ${id} not found`);
      if (!canViewFulfilment(ctx, row)) {
        return fail("permission_denied", "Fulfilment not visible to principal");
      }
      const token = await deps.port.findTokenDisplay(id);
      if (!token) return fail("not_found", "No token available for fulfilment");
      return ok(token);
    },
  };
}

export function createInMemoryFulfilmentQueryPort(
  seed: Fulfilment[] = [],
): FulfilmentQueryPort & {
  upsert: (f: Fulfilment) => void;
  setTokenDisplay: (token: TokenDisplayReadModel) => void;
} {
  const byId = new Map(seed.map((f) => [f.id, f]));
  const tokens = new Map<string, TokenDisplayReadModel>();
  return {
    upsert(f) {
      byId.set(f.id, f);
    },
    setTokenDisplay(token) {
      tokens.set(token.fulfilmentId, token);
    },
    async findById(id) {
      return byId.get(id) ?? null;
    },
    async list(filter) {
      return [...byId.values()].filter((f) => {
        if (filter?.status && f.state !== filter.status) return false;
        if (filter?.type && f.fulfilmentType !== filter.type) return false;
        if (filter?.partnerOrgId && f.partnerOrgId !== filter.partnerOrgId) {
          return false;
        }
        return true;
      });
    },
    async listEvents(fulfilmentId) {
      return byId.get(fulfilmentId)?.events ?? [];
    },
    async findTokenDisplay(fulfilmentId) {
      return tokens.get(fulfilmentId) ?? null;
    },
  };
}
