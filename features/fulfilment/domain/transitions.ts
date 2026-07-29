import type { FulfilmentType } from "./Fulfilment";
import type { FulfilmentState } from "./states";

const INSTANT_DIGITAL_TRANSITIONS: ReadonlyArray<
  readonly [FulfilmentState, FulfilmentState]
> = [
  ["created", "processing"],
  ["processing", "ready"],
  ["ready", "completed"],
  ["created", "cancelled"],
  ["created", "failed"],
  ["created", "expired"],
  ["processing", "cancelled"],
  ["processing", "failed"],
  ["processing", "expired"],
  ["ready", "cancelled"],
  ["ready", "failed"],
  ["ready", "expired"],
  ["cancelled", "refunded"],
  ["failed", "refunded"],
  ["expired", "refunded"],
  ["completed", "reversed"],
];

const QR_BARCODE_TRANSITIONS: ReadonlyArray<
  readonly [FulfilmentState, FulfilmentState]
> = [
  ["created", "reserved"],
  ["reserved", "ready"],
  ["ready", "awaiting_collection"],
  ["awaiting_collection", "validated"],
  ["validated", "collected"],
  ["collected", "completed"],
  ["created", "cancelled"],
  ["created", "failed"],
  ["created", "expired"],
  ["reserved", "cancelled"],
  ["reserved", "failed"],
  ["reserved", "expired"],
  ["ready", "cancelled"],
  ["ready", "failed"],
  ["ready", "expired"],
  ["awaiting_collection", "cancelled"],
  ["awaiting_collection", "failed"],
  ["awaiting_collection", "expired"],
  ["validated", "cancelled"],
  ["validated", "failed"],
  ["validated", "expired"],
  ["collected", "cancelled"],
  ["collected", "failed"],
  ["collected", "expired"],
  ["cancelled", "refunded"],
  ["failed", "refunded"],
  ["expired", "refunded"],
  ["completed", "reversed"],
];

/** Phase-1 edges only for instant_digital + qr_barcode; others empty until handlers land. */
const EMPTY_TRANSITIONS: ReadonlyArray<
  readonly [FulfilmentState, FulfilmentState]
> = [];

const BY_TYPE: Record<
  FulfilmentType,
  ReadonlyArray<readonly [FulfilmentState, FulfilmentState]>
> = {
  instant_digital: INSTANT_DIGITAL_TRANSITIONS,
  qr_barcode: QR_BARCODE_TRANSITIONS,
  physical_collection: EMPTY_TRANSITIONS,
  physical_shipping: EMPTY_TRANSITIONS,
  event_ticket: EMPTY_TRANSITIONS,
  sweepstakes: EMPTY_TRANSITIONS,
  donation: EMPTY_TRANSITIONS,
  premium_feature: EMPTY_TRANSITIONS,
};

function edgeKey(from: FulfilmentState, to: FulfilmentState): string {
  return `${from}->${to}`;
}

const LEGAL_SETS: Record<FulfilmentType, ReadonlySet<string>> = {
  instant_digital: new Set(
    INSTANT_DIGITAL_TRANSITIONS.map(([from, to]) => edgeKey(from, to)),
  ),
  qr_barcode: new Set(
    QR_BARCODE_TRANSITIONS.map(([from, to]) => edgeKey(from, to)),
  ),
  physical_collection: new Set(),
  physical_shipping: new Set(),
  event_ticket: new Set(),
  sweepstakes: new Set(),
  donation: new Set(),
  premium_feature: new Set(),
};

export function isLegalTransition(
  fulfilmentType: FulfilmentType,
  from: FulfilmentState,
  to: FulfilmentState,
): boolean {
  return LEGAL_SETS[fulfilmentType]?.has(edgeKey(from, to)) ?? false;
}

export function legalTransitionsFor(
  fulfilmentType: FulfilmentType,
): ReadonlyArray<readonly [FulfilmentState, FulfilmentState]> {
  return BY_TYPE[fulfilmentType] ?? [];
}
