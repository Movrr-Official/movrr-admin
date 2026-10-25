import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";
import type { Fulfilment } from "@/features/fulfilment/domain/Fulfilment";

/**
 * Command to redeem a catalog item: financial commitment + 1:1 fulfilment.
 */
export type RedeemRewardCommand = {
  catalogItemId: string;
  idempotencyKey: string;
};

export type RewardRedemption = {
  financial?: RedemptionFinancialState;
  rewardTitle?: string | null;
  thumbnailUrl?: string | null;
  redemptionStatus?: string;
  id: string;
  riderId: string;
  catalogItemId: string;
  pointsSpent: number;
  status: "committed";
  fulfilmentId: string;
  idempotencyKey: string;
  ledgerTransactionId: string | null;
  isFree?: boolean;
  createdAt: string;
};

export type RedemptionFinancialState = {
  originalPointsCharged: number | null;
  pointsRefunded: number | null;
  reservationReleased: number;
  outstandingRefund: number | null;
  netPointsSpent: number | null;
  cancellationActor: "admin" | "merchant" | "system" | null;
  cancellationReason: string | null;
  reconciliationRequired: boolean;
  state: "charged" | "refund_outstanding" | "refunded" | "reservation_released" | "reconciliation_required";
};

export type RedeemRewardResult = {
  redemption: RewardRedemption;
  fulfilment: Fulfilment;
};

export type CatalogItem = {
  thumbnailUrl?: string | null;
  description?: string;
  category?: string;
  inventoryCount?: number | null;
  updatedAt?: string;
  id: string;
  sku: string;
  title: string;
  status: string;
  fulfilmentType: FulfilmentType | null;
  pointsPrice: number;
  resourceId: string | null;
  partnerOrgId: string | null;
};

export type CatalogRepository = {
  getById: (id: string) => Promise<CatalogItem | null>;
};

export type RedemptionRepository = {
  findById: (id: string) => Promise<RewardRedemption | null>;
};

/** Phase 1 redeemable fulfilment types (catalog must block others before debit). */
export const SUPPORTED_REDEEM_FULFILMENT_TYPES = [
  "instant_digital",
  "qr_barcode",
] as const satisfies readonly FulfilmentType[];

export type SupportedRedeemFulfilmentType =
  (typeof SUPPORTED_REDEEM_FULFILMENT_TYPES)[number];

export function isSupportedRedeemFulfilmentType(
  type: string | null | undefined,
): type is SupportedRedeemFulfilmentType {
  return type === "instant_digital" || type === "qr_barcode";
}
