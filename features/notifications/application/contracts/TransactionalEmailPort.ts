export const REWARD_EMAIL_KINDS = [
  "redemption_received",
  "ready",
  "completed",
  "cancelled",
  "failed",
  "expired",
  "refunded",
] as const;

export type RewardEmailKind = (typeof REWARD_EMAIL_KINDS)[number];

export type RewardLifecycleEmailInput = {
  kind: RewardEmailKind;
  idempotencyKey: string;
  occurredAt: string;
  correlationId: string;
  riderId: string;
  fulfilmentId: string;
  redemptionId?: string;
  catalogItemId?: string;
  pointsSpent?: number;
  fulfilmentType?: string;
  expiresAt?: string | null;
  reason?: string;
};

export type TransactionalEmailPort = {
  sendRewardLifecycle(input: RewardLifecycleEmailInput): Promise<void>;
};

export const noopTransactionalEmailPort: TransactionalEmailPort = {
  async sendRewardLifecycle() {},
};
