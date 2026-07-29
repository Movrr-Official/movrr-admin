import {
  fail,
  ok,
  type ApplicationResult,
} from "@/lib/result/ApplicationResult";
import type {
  FraudDecision,
  FraudEvaluationInput,
  FraudPolicyEngine,
  FraudPolicyExtension,
  IdempotencyKeyRef,
  IdempotencyStore,
  RateLimitStore,
  ReplayStore,
} from "@/features/fraud/application/contracts/FraudPolicyEngine";

export type FraudPolicyEngineDeps = {
  idempotency: IdempotencyStore;
  replay: ReplayStore;
  rateLimit: RateLimitStore;
  /** Optional future hooks — unused in Phase 1. */
  extensions?: FraudPolicyExtension;
};

/**
 * Phase 1: idempotency + replay (jti) + rate limit.
 * Evaluates only; does not mutate business aggregates / refunds / resources.
 */
export function createFraudPolicyEngine(
  deps: FraudPolicyEngineDeps,
): FraudPolicyEngine {
  return {
    async evaluate(
      input: FraudEvaluationInput,
    ): Promise<ApplicationResult<FraudDecision>> {
      if (input.idempotencyKey) {
        const prior = await deps.idempotency.get({
          principalId: input.principalId,
          scope: input.scope,
          key: input.idempotencyKey,
        });
        if (prior !== null) {
          return ok({ type: "idempotent_replay", payload: prior });
        }
      }

      if (input.jti) {
        const fresh = await deps.replay.consume(input.jti);
        if (!fresh) {
          return ok({ type: "deny", reason: "replay_detected" });
        }
      }

      if (input.rateLimitKey) {
        const allowed = await deps.rateLimit.hit(input.rateLimitKey);
        if (!allowed) {
          return ok({ type: "deny", reason: "rate_limited" });
        }
      }

      // Extension stubs (velocity / anomaly / risk) — intentionally unused in Phase 1.
      void deps.extensions;

      return ok({ type: "allow" });
    },

    async recordIdempotentSuccess(
      key: IdempotencyKeyRef,
      payload: unknown,
    ): Promise<ApplicationResult<void>> {
      if (!key.principalId || !key.scope || !key.key) {
        return fail("validation", "Idempotency key requires principalId, scope, and key");
      }
      await deps.idempotency.put(key, payload);
      return ok(undefined);
    },
  };
}
