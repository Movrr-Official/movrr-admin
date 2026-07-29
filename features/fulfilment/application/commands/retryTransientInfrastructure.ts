export type RetryTransientInfrastructureResult = {
  retried: number;
};

/**
 * Phase-1 stub: retries of failed infra markers land in a later plan.
 * Idempotent no-op so the scheduled route can be wired safely.
 */
export async function retryTransientInfrastructure(): Promise<RetryTransientInfrastructureResult> {
  return { retried: 0 };
}
