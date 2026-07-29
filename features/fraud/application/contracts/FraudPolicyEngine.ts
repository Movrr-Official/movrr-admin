import type { ApplicationResult } from "@/lib/result/ApplicationResult";

/**
 * Fraud evaluates and returns a decision only.
 * Never mutates business aggregates, refunds, or resource allocations.
 *
 * Extension points (Phase 2+ — stubs only): velocity, anomaly, abuse signals, risk scoring.
 */
export type FraudDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string }
  | { type: "idempotent_replay"; payload: unknown };

export type IdempotencyKeyRef = {
  principalId: string;
  scope: string;
  key: string;
};

export type FraudEvaluationInput = {
  principalId: string;
  scope: string;
  idempotencyKey?: string;
  jti?: string;
  rateLimitKey?: string;
};

export type FraudPolicyEngine = {
  evaluate: (
    input: FraudEvaluationInput,
  ) => Promise<ApplicationResult<FraudDecision>>;
  /**
   * Persist a successful response for later idempotent replay.
   * Writes fraud infrastructure store only — not business aggregates.
   */
  recordIdempotentSuccess: (
    key: IdempotencyKeyRef,
    payload: unknown,
  ) => Promise<ApplicationResult<void>>;
};

export type IdempotencyStore = {
  get: (key: IdempotencyKeyRef) => Promise<unknown | null>;
  put: (key: IdempotencyKeyRef, payload: unknown) => Promise<void>;
};

export type ReplayStore = {
  /** Returns true if newly consumed; false if already consumed. */
  consume: (jti: string) => Promise<boolean>;
  isConsumed: (jti: string) => Promise<boolean>;
};

export type RateLimitStore = {
  /** Returns true when under limit (and increments); false when exceeded. */
  hit: (key: string) => Promise<boolean>;
};

/**
 * Future policy hooks — empty stubs so velocity/anomaly/risk can plug in
 * without redesign. Phase 1 does not implement scoring.
 */
export type FraudPolicyExtension = {
  /** @future velocity checks */
  evaluateVelocity?: (input: FraudEvaluationInput) => Promise<FraudDecision | null>;
  /** @future anomaly / abuse signals */
  evaluateAnomaly?: (input: FraudEvaluationInput) => Promise<FraudDecision | null>;
  /** @future risk scoring */
  evaluateRiskScore?: (input: FraudEvaluationInput) => Promise<FraudDecision | null>;
};
