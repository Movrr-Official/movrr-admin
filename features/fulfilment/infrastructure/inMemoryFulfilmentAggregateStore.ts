import type {
  FulfilmentAggregateStore,
  StoredFulfilmentAggregate,
} from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";

/** Process-local aggregate store for unit tests. */
export function createInMemoryFulfilmentAggregateStore(): FulfilmentAggregateStore {
  const store = new Map<string, StoredFulfilmentAggregate>();

  return {
    async get(id) {
      return store.get(id) ?? null;
    },
    async exists(id) {
      return store.has(id);
    },
    async save(aggregate) {
      store.set(aggregate.fulfilment.id, aggregate);
    },
    async list() {
      return [...store.values()];
    },
  };
}
