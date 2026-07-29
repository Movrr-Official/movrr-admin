import type { FulfilmentOutcome } from "./outcome";
import type { FulfilmentState } from "./states";

export const FULFILMENT_TYPES = [
  "instant_digital",
  "qr_barcode",
  "physical_collection",
  "physical_shipping",
  "event_ticket",
  "sweepstakes",
  "donation",
  "premium_feature",
] as const;

export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export type FulfilmentEvent = {
  id: string;
  fulfilmentId: string;
  fromState: FulfilmentState;
  toState: FulfilmentState;
  reason: string;
  occurredAt: string;
};

export type Fulfilment = {
  id: string;
  redemptionId: string;
  riderId: string;
  catalogItemId: string;
  fulfilmentType: FulfilmentType;
  state: FulfilmentState;
  outcome: FulfilmentOutcome | null;
  version: number;
  partnerOrgId: string | null;
  idempotencyKey: string;
  expiresAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  /** In-memory append-only event intents (not yet persisted). */
  events: FulfilmentEvent[];
};

export type CreateFulfilmentInput = {
  id: string;
  redemptionId: string;
  riderId: string;
  catalogItemId: string;
  fulfilmentType: FulfilmentType;
  state?: FulfilmentState;
  outcome?: FulfilmentOutcome | null;
  version?: number;
  partnerOrgId?: string | null;
  idempotencyKey: string;
  expiresAt?: string | null;
  completedAt?: string | null;
  metadata?: Record<string, unknown>;
  events?: FulfilmentEvent[];
};

export function createFulfilment(input: CreateFulfilmentInput): Fulfilment {
  return {
    id: input.id,
    redemptionId: input.redemptionId,
    riderId: input.riderId,
    catalogItemId: input.catalogItemId,
    fulfilmentType: input.fulfilmentType,
    state: input.state ?? "created",
    outcome: input.outcome ?? null,
    version: input.version ?? 0,
    partnerOrgId: input.partnerOrgId ?? null,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt ?? null,
    completedAt: input.completedAt ?? null,
    metadata: input.metadata ?? {},
    events: input.events ? [...input.events] : [],
  };
}
