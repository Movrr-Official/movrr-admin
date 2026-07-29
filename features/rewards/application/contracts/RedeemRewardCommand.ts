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
  id: string;
  riderId: string;
  catalogItemId: string;
  pointsSpent: number;
  status: "committed";
  fulfilmentId: string;
  idempotencyKey: string;
  ledgerTransactionId: string;
  createdAt: string;
};

export type RedeemRewardResult = {
  redemption: RewardRedemption;
  fulfilment: Fulfilment;
};

export type CatalogItem = {
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
  save: (redemption: RewardRedemption) => Promise<void>;
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
  return (
    type === "instant_digital" || type === "qr_barcode"
  );
}
