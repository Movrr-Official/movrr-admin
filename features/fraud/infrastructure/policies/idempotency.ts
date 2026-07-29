import type {
  IdempotencyKeyRef,
  IdempotencyStore,
} from "@/features/fraud/application/contracts/FraudPolicyEngine";

function compositeKey(ref: IdempotencyKeyRef): string {
  return `${ref.principalId}\0${ref.scope}\0${ref.key}`;
}

/** In-memory idempotency store keyed by (principalId, scope, key). */
export function createInMemoryIdempotencyStore(): IdempotencyStore {
  const results = new Map<string, unknown>();

  return {
    async get(key: IdempotencyKeyRef): Promise<unknown | null> {
      return results.has(compositeKey(key))
        ? results.get(compositeKey(key))
        : null;
    },

    async put(key: IdempotencyKeyRef, payload: unknown): Promise<void> {
      results.set(compositeKey(key), payload);
    },
  };
}
