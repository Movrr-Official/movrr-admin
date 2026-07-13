import { describe, expect, it } from "vitest";
import {
  filterGpsPoint,
  validatePointTimestamp,
  updateZoneVisitState,
  verifyGpsBatch,
  type GpsPoint,
} from "@/lib/services/complianceVerifier";

const basePoint = (overrides: Partial<GpsPoint> = {}): GpsPoint => ({
  lat: 51.92,
  lon: 4.48,
  speed_kmh: 12,
  accuracy_m: 10,
  heading: 90,
  recorded_at: "2026-07-07T10:00:00.000Z",
  ...overrides,
});

describe("validatePointTimestamp", () => {
  const sessionStart = "2026-07-07T09:00:00.000Z";
  const now = new Date("2026-07-07T10:00:00.000Z").getTime();

  it("rejects timestamps far in the future", () => {
    expect(
      validatePointTimestamp(
        "2026-07-07T10:05:00.000Z",
        sessionStart,
        now,
      ),
    ).toBe("future_skew");
  });

  it("rejects timestamps before session start", () => {
    expect(
      validatePointTimestamp(
        "2026-07-07T08:00:00.000Z",
        sessionStart,
        now,
      ),
    ).toBe("before_session");
  });

  it("accepts timestamps within the allowed window", () => {
    expect(
      validatePointTimestamp(
        "2026-07-07T09:30:00.000Z",
        sessionStart,
        now,
      ),
    ).toBe("ok");
  });
});

describe("filterGpsPoint hardening", () => {
  it("rejects points without accuracy", () => {
    expect(
      filterGpsPoint(basePoint({ accuracy_m: null }), null),
    ).toBe("accuracy_gate");
  });

  it("rejects implied speed above max when speed_kmh omitted", () => {
    const prev = basePoint({ recorded_at: "2026-07-07T10:00:00.000Z" });
    const next = basePoint({
      lat: 51.95,
      speed_kmh: null,
      recorded_at: "2026-07-07T10:00:10.000Z",
    });
    expect(filterGpsPoint(next, prev)).toBe("speed_gate");
  });
});

describe("verifyGpsBatch impression anti-fraud", () => {
  const zoneState = {
    zoneId: "zone-1",
    polygon: {
      outer: [
        { lat: 51.9, lon: 4.47 },
        { lat: 51.93, lon: 4.47 },
        { lat: 51.93, lon: 4.49 },
        { lat: 51.9, lon: 4.49 },
      ],
    },
    state: "outside" as const,
    enteredAt: null,
    enteredAtServer: null,
    pointsInZone: 0,
    speedSumInZone: 0,
    hasSpeedViolation: false,
    consecutiveInsidePoints: 0,
    consecutiveOutsidePoints: 0,
    boundaryOscillationCount: 0,
  };

  it("does not award impressions for two-point instant dwell", () => {
    const enter1 = basePoint({ recorded_at: "2026-07-07T10:00:00.000Z" });
    const enter2 = basePoint({ recorded_at: "2026-07-07T10:00:05.000Z" });
    const exit1 = basePoint({ recorded_at: "2026-07-07T10:00:35.000Z" });
    const exit2 = basePoint({ recorded_at: "2026-07-07T10:00:40.000Z" });

    const result = verifyGpsBatch({
      rawPoints: [enter1, enter2, exit1, exit2],
      lastAccepted: null,
      zoneStates: [zoneState],
      corridorSegments: [],
      corridorToleranceM: 30,
      suggestedRouteId: null,
      sessionStartedAt: "2026-07-07T09:00:00.000Z",
      serverReceivedAt: "2026-07-07T10:00:45.000Z",
    });

    const completed = result.zoneVisitUpdates.find((u) => u.completed)?.completed;
    expect(completed?.impressionUnits ?? 0).toBe(0);
  });

  it("uses server clock to cap dwell time on zone exit", () => {
    const polygon = {
      outer: [
        { lat: 51.9, lon: 4.47 },
        { lat: 51.93, lon: 4.47 },
        { lat: 51.93, lon: 4.49 },
        { lat: 51.9, lon: 4.49 },
      ],
    };
    const insideState = {
      zoneId: "zone-1",
      polygon,
      state: "inside" as const,
      enteredAt: "2026-07-07T10:00:00.000Z",
      enteredAtServer: "2026-07-07T10:00:00.000Z",
      pointsInZone: 4,
      speedSumInZone: 48,
      hasSpeedViolation: false,
      consecutiveInsidePoints: 2,
      consecutiveOutsidePoints: 0,
      boundaryOscillationCount: 0,
    };

    const outsidePoint = (recordedAt: string) =>
      basePoint({ lat: 51.89, lon: 4.48, recorded_at: recordedAt });

    const first = updateZoneVisitState(
      outsidePoint("2026-07-07T10:05:00.000Z"),
      insideState,
      "2026-07-07T10:00:20.000Z",
    );
    expect(first.update).toBeNull();

    const second = updateZoneVisitState(
      outsidePoint("2026-07-07T10:05:05.000Z"),
      first.state,
      "2026-07-07T10:00:20.000Z",
    );
    expect(second.update?.completed?.dwellTimeS).toBe(20);
  });
});
