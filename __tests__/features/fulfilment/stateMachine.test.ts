import { describe, it, expect } from "vitest";
import {
  FULFILMENT_STATES,
  type FulfilmentState,
} from "@/features/fulfilment/domain/states";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";
import { deriveProgress } from "@/features/fulfilment/domain/progress";
import { createFulfilmentStateMachine } from "@/features/fulfilment/application/FulfilmentStateMachine";
import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";

const sm = createFulfilmentStateMachine();

const INSTANT_DIGITAL_EDGES: Array<[FulfilmentState, FulfilmentState]> = [
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

const QR_BARCODE_EDGES: Array<[FulfilmentState, FulfilmentState]> = [
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

function edgeKey(from: FulfilmentState, to: FulfilmentState): string {
  return `${from}->${to}`;
}

function legalSet(
  edges: Array<[FulfilmentState, FulfilmentState]>,
): Set<string> {
  return new Set(edges.map(([from, to]) => edgeKey(from, to)));
}

function fulfilmentAt(
  type: FulfilmentType,
  state: FulfilmentState,
  version = 0,
) {
  return createFulfilment({
    id: "ful-1",
    redemptionId: "red-1",
    riderId: "rider-1",
    catalogItemId: "cat-1",
    fulfilmentType: type,
    state,
    version,
    idempotencyKey: "idem-1",
  });
}

describe("FulfilmentStateMachine — instant_digital", () => {
  it.each(INSTANT_DIGITAL_EDGES)(
    "allows %s → %s",
    (from, to) => {
      const fulfilment = fulfilmentAt("instant_digital", from, 3);
      const result = sm.requestTransition(fulfilment, to, "test", 3);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state).toBe(to);
      expect(result.value.version).toBe(4);
      expect(result.value.events).toHaveLength(1);
      expect(result.value.events[0]?.fromState).toBe(from);
      expect(result.value.events[0]?.toState).toBe(to);
      expect(result.value.events[0]?.reason).toBe("test");
    },
  );

  it("rejects all illegal transitions", () => {
    const legal = legalSet(INSTANT_DIGITAL_EDGES);

    for (const from of FULFILMENT_STATES) {
      for (const to of FULFILMENT_STATES) {
        if (legal.has(edgeKey(from, to))) continue;

        const fulfilment = fulfilmentAt("instant_digital", from, 0);
        const result = sm.requestTransition(fulfilment, to, "illegal", 0);

        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.kind).toBe("IllegalTransition");
      }
    }
  });

  it("happy path sets outcome success on completed", () => {
    let f = fulfilmentAt("instant_digital", "created", 0);
    for (const to of ["processing", "ready", "completed"] as const) {
      const result = sm.requestTransition(f, to, "advance", f.version);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      f = result.value;
    }
    expect(f.state).toBe("completed");
    expect(f.outcome).toBe("success");
    expect(f.completedAt).toBeTruthy();
    expect(f.events).toHaveLength(3);
  });

  it("refund path cancelled → refunded updates outcome", () => {
    let f = fulfilmentAt("instant_digital", "processing", 1);
    const cancelled = sm.requestTransition(f, "cancelled", "user_cancel", 1);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.value.outcome).toBe("cancelled");

    const refunded = sm.requestTransition(
      cancelled.value,
      "refunded",
      "wallet_refund",
      cancelled.value.version,
    );
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) return;
    expect(refunded.value.state).toBe("refunded");
    expect(refunded.value.outcome).toBe("refunded");
  });
});

describe("FulfilmentStateMachine — qr_barcode", () => {
  it.each(QR_BARCODE_EDGES)("allows %s → %s", (from, to) => {
    const fulfilment = fulfilmentAt("qr_barcode", from, 2);
    const result = sm.requestTransition(fulfilment, to, "test", 2);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe(to);
    expect(result.value.version).toBe(3);
    expect(result.value.events).toHaveLength(1);
  });

  it("rejects all illegal transitions", () => {
    const legal = legalSet(QR_BARCODE_EDGES);

    for (const from of FULFILMENT_STATES) {
      for (const to of FULFILMENT_STATES) {
        if (legal.has(edgeKey(from, to))) continue;

        const fulfilment = fulfilmentAt("qr_barcode", from, 0);
        const result = sm.requestTransition(fulfilment, to, "illegal", 0);

        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.kind).toBe("IllegalTransition");
      }
    }
  });

  it("happy path created → … → completed", () => {
    const path = [
      "reserved",
      "ready",
      "awaiting_collection",
      "validated",
      "collected",
      "completed",
    ] as const;

    let f = fulfilmentAt("qr_barcode", "created", 0);
    for (const to of path) {
      const result = sm.requestTransition(f, to, "advance", f.version);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      f = result.value;
    }
    expect(f.state).toBe("completed");
    expect(f.outcome).toBe("success");
    expect(f.events).toHaveLength(6);
  });

  it("rejects completed → ready", () => {
    const fulfilment = fulfilmentAt("qr_barcode", "completed", 5);
    const result = sm.requestTransition(fulfilment, "ready", "noop", 5);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("IllegalTransition");
  });
});

describe("FulfilmentStateMachine — concurrency and terminals", () => {
  it("rejects when expectedVersion does not match", () => {
    const fulfilment = fulfilmentAt("instant_digital", "created", 1);
    const result = sm.requestTransition(fulfilment, "processing", "race", 0);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("ConcurrencyConflict");
    expect(fulfilment.state).toBe("created");
    expect(fulfilment.version).toBe(1);
  });

  it("treats refunded and reversed as terminal", () => {
    for (const terminal of ["refunded", "reversed"] as const) {
      for (const to of FULFILMENT_STATES) {
        const fulfilment = fulfilmentAt("instant_digital", terminal, 0);
        const result = sm.requestTransition(fulfilment, to, "blocked", 0);
        expect(result.ok).toBe(false);
      }
    }
  });

  it("sets outcomes for fail / expire / reverse paths", () => {
    const failed = sm.requestTransition(
      fulfilmentAt("instant_digital", "processing", 0),
      "failed",
      "provider_error",
      0,
    );
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.value.outcome).toBe("failed");

    const expired = sm.requestTransition(
      fulfilmentAt("qr_barcode", "reserved", 0),
      "expired",
      "ttl",
      0,
    );
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.value.outcome).toBe("expired");

    const reversed = sm.requestTransition(
      fulfilmentAt("instant_digital", "completed", 0),
      "reversed",
      "chargeback",
      0,
    );
    expect(reversed.ok).toBe(true);
    if (!reversed.ok) return;
    expect(reversed.value.outcome).toBe("reversed");
  });

  it("does not mutate input aggregate on success", () => {
    const fulfilment = fulfilmentAt("instant_digital", "created", 0);
    const result = sm.requestTransition(fulfilment, "processing", "start", 0);
    expect(result.ok).toBe(true);
    expect(fulfilment.state).toBe("created");
    expect(fulfilment.version).toBe(0);
    expect(fulfilment.events).toHaveLength(0);
  });
});

describe("deriveProgress", () => {
  it.each([
    ["created", "preparing"],
    ["reserved", "preparing"],
    ["processing", "preparing"],
    ["ready", "ready"],
    ["awaiting_collection", "awaiting_collection"],
    ["validated", "awaiting_collection"],
    ["collected", "awaiting_collection"],
    ["dispatched", "awaiting_collection"],
    ["delivered", "awaiting_collection"],
    ["completed", "completed"],
    ["cancelled", "unavailable"],
    ["failed", "unavailable"],
    ["expired", "unavailable"],
    ["refunded", "unavailable"],
    ["reversed", "unavailable"],
  ] as const)("maps %s → %s", (state, progress) => {
    expect(deriveProgress(state)).toBe(progress);
  });
});
