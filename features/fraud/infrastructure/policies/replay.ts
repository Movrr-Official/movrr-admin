import type { ReplayStore } from "@/features/fraud/application/contracts/FraudPolicyEngine";

/** In-memory consumed-jti store for replay protection. */
export function createInMemoryReplayStore(): ReplayStore {
  const consumed = new Set<string>();

  return {
    async consume(jti: string): Promise<boolean> {
      if (consumed.has(jti)) return false;
      consumed.add(jti);
      return true;
    },

    async isConsumed(jti: string): Promise<boolean> {
      return consumed.has(jti);
    },
  };
}
