import { z } from "zod";

export const rewardTransactionTypeSchema = z.enum([
  "awarded",
  "redeemed",
  "adjusted",
]);

export const rewardTransactionSchema = z.object({
  id: z.string(),
  riderId: z.string(),
  campaignId: z.string().optional(),
  routeId: z.string().optional(),
  type: rewardTransactionTypeSchema,
  points: z.number(),
  description: z.string().optional(),
  balanceAfter: z.number(),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(), // Admin who created adjustment
});

export const riderBalanceSchema = z.object({
  riderId: z.string(),
  riderName: z.string(),
  riderEmail: z.string(),
  totalPointsAwarded: z.number(),
  totalPointsRedeemed: z.number(),
  currentBalance: z.number(),
  lastTransactionDate: z.string().datetime().optional(),
});

export type RewardTransaction = z.infer<typeof rewardTransactionSchema>;
export type RewardTransactionType = z.infer<typeof rewardTransactionTypeSchema>;
export type RiderBalance = z.infer<typeof riderBalanceSchema>;
