import type { FulfilmentAggregateStore } from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";
import type {
  FulfilmentQueryPort,
  TokenDisplayReadModel,
} from "@/features/fulfilment/application/queries/fulfilmentQueries";

/** Read-only projection of the authoritative persisted lifecycle. */
export function createAggregateBackedFulfilmentQueryPort(deps: {
  store: FulfilmentAggregateStore;
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
    async findTokenDisplay() { return null; },
  };
}
