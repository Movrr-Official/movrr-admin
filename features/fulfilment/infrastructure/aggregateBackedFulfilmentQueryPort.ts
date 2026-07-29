import type { FulfilmentAggregateStore } from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";
import type {
  FulfilmentQueryPort,
  TokenDisplayReadModel,
} from "@/features/fulfilment/application/queries/fulfilmentQueries";
import type { TokenStore } from "@/features/fulfilment/application/contracts/TokenStore";

/**
 * Query port that reads from the same aggregate store as the engine
 * (eliminates phantom seed f-1 divergence).
 */
export function createAggregateBackedFulfilmentQueryPort(deps: {
  store: FulfilmentAggregateStore;
  tokens?: TokenStore;
}): FulfilmentQueryPort {
  return {
    async findById(id) {
      const row = await deps.store.get(id);
      return row?.fulfilment ?? null;
    },
    async list(filter) {
      const rows = await deps.store.list();
      return rows
        .map((r) => r.fulfilment)
        .filter((f) => {
          if (filter?.status && f.state !== filter.status) return false;
          if (filter?.type && f.fulfilmentType !== filter.type) return false;
          if (filter?.partnerOrgId && f.partnerOrgId !== filter.partnerOrgId) {
            return false;
          }
          return true;
        });
    },
    async listEvents(fulfilmentId) {
      const row = await deps.store.get(fulfilmentId);
      return row?.fulfilment.events ?? [];
    },
    async findTokenDisplay(fulfilmentId) {
      if (deps.tokens) {
        const token = await deps.tokens.getByFulfilmentId(fulfilmentId);
        if (token) {
          const display: TokenDisplayReadModel = {
            fulfilmentId,
            tokenType: token.tokenType,
            status: token.status,
            displayHint: `${token.tokenType.toUpperCase()} · ${token.tokenId.slice(0, 8)}`,
            expiresAt: token.expiresAt,
          };
          return display;
        }
      }
      const row = await deps.store.get(fulfilmentId);
      if (!row) return null;
      const display: TokenDisplayReadModel = {
        fulfilmentId,
        tokenType: row.tokenType,
        status: "active",
        displayHint: `${row.tokenType.toUpperCase()} · ${fulfilmentId.slice(0, 8)}`,
        expiresAt: row.fulfilment.expiresAt,
      };
      return display;
    },
  };
}
