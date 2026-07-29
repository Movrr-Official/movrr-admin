/**
 * Observability helpers for fulfilment (spec §7.4–7.5).
 * Structured log fields + in-process counters for redeem / fulfilment /
 * validate / jobs. Avoids coupling to env-gated app logger so unit tests stay pure.
 */

export type FulfilmentMetricName =
  | "redeem_attempted"
  | "redeem_succeeded"
  | "redeem_failed"
  | "fulfilment_transition"
  | "fulfilment_failed"
  | "validate_attempted"
  | "validate_succeeded"
  | "validate_failed"
  | "job_expire_run"
  | "job_expire_failed"
  | "job_release_run"
  | "job_release_failed"
  | "job_retry_run"
  | "job_retry_failed"
  | "pool_exhausted";

export type FulfilmentLogOperation =
  | "redeem"
  | "fulfilment"
  | "validate"
  | "job"
  | "pool";

export type StructuredLogFn = (
  message: string,
  fields: Record<string, unknown>,
) => void;

/**
 * Structured log fields for fulfilment observability (spec §7.4).
 */
export function fulfilmentLogFields(
  operation: FulfilmentLogOperation,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    area: "fulfilment",
    operation,
    ...fields,
  };
}

const defaultLog: StructuredLogFn = (message, fields) => {
  console.info(message, fields);
};

export type FulfilmentMetrics = {
  getCount: (metric: FulfilmentMetricName) => number;
  increment: (metric: FulfilmentMetricName) => void;
  recordRedeemAttempt: (fields: {
    correlationId: string;
    catalogItemId: string;
  }) => void;
  recordRedeemSuccess: (fields: {
    correlationId: string;
    fulfilmentId: string;
  }) => void;
  recordRedeemFailure: (fields: {
    correlationId: string;
    reason: string;
  }) => void;
  recordFulfilmentTransition: (fields: {
    correlationId: string;
    fulfilmentId: string;
    fromState: string;
    toState: string;
  }) => void;
  recordFulfilmentFailure: (fields: {
    correlationId: string;
    fulfilmentId: string;
    reason: string;
  }) => void;
  recordValidateAttempt: (fields: { correlationId: string }) => void;
  recordValidateSuccess: (fields: {
    correlationId: string;
    fulfilmentId: string;
  }) => void;
  recordValidateFailure: (fields: {
    correlationId: string;
    reason: string;
  }) => void;
  recordJobRun: (fields: {
    job: "expire" | "release" | "retry";
    expired?: number;
    released?: number;
    retried?: number;
  }) => void;
  recordJobFailure: (fields: {
    job: "expire" | "release" | "retry";
    error: string;
  }) => void;
  recordPoolExhaustion: (fields: { resourceId: string }) => void;
};

/**
 * In-process counters + structured logs for redeem/fulfilment/validate/jobs.
 * Health signals: pool exhaustion, job failure, fulfilment failure rate.
 */
export function createFulfilmentMetrics(
  log: StructuredLogFn = defaultLog,
): FulfilmentMetrics {
  const counts = new Map<FulfilmentMetricName, number>();

  function increment(metric: FulfilmentMetricName): void {
    counts.set(metric, (counts.get(metric) ?? 0) + 1);
  }

  function getCount(metric: FulfilmentMetricName): number {
    return counts.get(metric) ?? 0;
  }

  return {
    getCount,
    increment,

    recordRedeemAttempt(fields) {
      increment("redeem_attempted");
      log(
        "fulfilment.redeem.attempt",
        fulfilmentLogFields("redeem", { ...fields, outcome: "attempt" }),
      );
    },

    recordRedeemSuccess(fields) {
      increment("redeem_succeeded");
      log(
        "fulfilment.redeem.success",
        fulfilmentLogFields("redeem", { ...fields, outcome: "success" }),
      );
    },

    recordRedeemFailure(fields) {
      increment("redeem_failed");
      log(
        "fulfilment.redeem.failure",
        fulfilmentLogFields("redeem", { ...fields, outcome: "failure" }),
      );
    },

    recordFulfilmentTransition(fields) {
      increment("fulfilment_transition");
      log("fulfilment.transition", fulfilmentLogFields("fulfilment", fields));
    },

    recordFulfilmentFailure(fields) {
      increment("fulfilment_failed");
      log(
        "fulfilment.failure",
        fulfilmentLogFields("fulfilment", {
          ...fields,
          healthSignal: "fulfilment_failure_rate",
        }),
      );
    },

    recordValidateAttempt(fields) {
      increment("validate_attempted");
      log(
        "fulfilment.validate.attempt",
        fulfilmentLogFields("validate", { ...fields, outcome: "attempt" }),
      );
    },

    recordValidateSuccess(fields) {
      increment("validate_succeeded");
      log(
        "fulfilment.validate.success",
        fulfilmentLogFields("validate", { ...fields, outcome: "success" }),
      );
    },

    recordValidateFailure(fields) {
      increment("validate_failed");
      log(
        "fulfilment.validate.failure",
        fulfilmentLogFields("validate", { ...fields, outcome: "failure" }),
      );
    },

    recordJobRun(fields) {
      const metric =
        fields.job === "expire"
          ? "job_expire_run"
          : fields.job === "release"
            ? "job_release_run"
            : "job_retry_run";
      increment(metric);
      log(
        `fulfilment.job.${fields.job}.run`,
        fulfilmentLogFields("job", fields),
      );
    },

    recordJobFailure(fields) {
      const metric =
        fields.job === "expire"
          ? "job_expire_failed"
          : fields.job === "release"
            ? "job_release_failed"
            : "job_retry_failed";
      increment(metric);
      log(
        `fulfilment.job.${fields.job}.failure`,
        fulfilmentLogFields("job", {
          ...fields,
          healthSignal: "scheduled_job_failure",
        }),
      );
    },

    recordPoolExhaustion(fields) {
      increment("pool_exhausted");
      log(
        "fulfilment.pool.exhausted",
        fulfilmentLogFields("pool", {
          ...fields,
          healthSignal: "resource_pool_exhaustion",
        }),
      );
    },
  };
}
