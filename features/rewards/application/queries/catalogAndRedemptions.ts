import { fail, ok, type ApplicationResult } from "@/lib/result/ApplicationResult";
import type { RequestContext } from "@/features/identity/domain/Principal";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";
import type {
  CatalogItem,
  CatalogRepository,
  RedemptionRepository,
  RewardRedemption,
} from "@/features/rewards/application/contracts/RedeemRewardCommand";

export type CatalogListPort = CatalogRepository & {
  list: () => Promise<CatalogItem[]>;
};

export type RedemptionListPort = RedemptionRepository & {
  listByRider: (riderId: string) => Promise<RewardRedemption[]>;
};

export type CatalogQueries = {
  list: (ctx: RequestContext) => Promise<ApplicationResult<CatalogItem[]>>;
  getById: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<CatalogItem>>;
};

export type RedemptionQueries = {
  listMine: (
    ctx: RequestContext,
  ) => Promise<ApplicationResult<RewardRedemption[]>>;
  getById: (
    ctx: RequestContext,
    id: string,
  ) => Promise<ApplicationResult<RewardRedemption>>;
};

export function createCatalogQueries(deps: {
  authorisation: AuthorisationService;
  catalog: CatalogListPort;
}): CatalogQueries {
  return {
    async list(ctx) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "rewards.catalog.read",
      );
      if (!authz.ok) return authz;
      return ok(await deps.catalog.list());
    },
    async getById(ctx, id) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "rewards.catalog.read",
      );
      if (!authz.ok) return authz;
      const item = await deps.catalog.getById(id);
      if (!item) return fail("not_found", `Catalog item ${id} not found`);
      return ok(item);
    },
  };
}

export function createRedemptionQueries(deps: {
  authorisation: AuthorisationService;
  redemptions: RedemptionListPort;
}): RedemptionQueries {
  return {
    async listMine(ctx) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "fulfilment.read",
      );
      if (!authz.ok) return authz;
      if (ctx.principal.type === "rider") {
        return ok(await deps.redemptions.listByRider(ctx.principal.riderId));
      }
      // Admin / ops: empty list until dedicated ops query exists
      return ok([]);
    },
    async getById(ctx, id) {
      const authz = deps.authorisation.assertCapability(
        ctx,
        "fulfilment.read",
      );
      if (!authz.ok) return authz;
      const row = await deps.redemptions.findById(id);
      if (!row) return fail("not_found", `Redemption ${id} not found`);
      if (
        ctx.principal.type === "rider" &&
        row.riderId !== ctx.principal.riderId
      ) {
        return fail("permission_denied", "Redemption not visible to principal");
      }
      return ok(row);
    },
  };
}

export function createInMemoryCatalogListPort(
  seed: CatalogItem[] = [],
): CatalogListPort & { seed: (item: CatalogItem) => void } {
  const items = new Map(seed.map((item) => [item.id, item]));
  return {
    seed(item) {
      items.set(item.id, item);
    },
    async getById(id) {
      return items.get(id) ?? null;
    },
    async list() {
      return [...items.values()];
    },
  };
}

export function createInMemoryRedemptionListPort(): RedemptionListPort {
  const rows = new Map<string, RewardRedemption>();
  return {
    async save(redemption) {
      rows.set(redemption.id, redemption);
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async listByRider(riderId) {
      return [...rows.values()].filter((r) => r.riderId === riderId);
    },
  };
}
