/**
 * Compliance Verifier — MOVRR Backend
 * Version: v1  (stored in ride_session.algorithm_version)
 *
 * AUTHORITATIVE compliance logic. This module is the single source of truth
 * for what counts as compliant. The mobile client runs identical logic for
 * real-time UI feedback only — rewards are NEVER computed from client results.
 *
 * Exports:
 *   - isPointInPolygon()      — ray-casting, shared geometry primitive
 *   - distanceToPolyline()    — perpendicular distance for corridor compliance
 *   - checkCorridorPoint()    — standard-ride compliance decision per GPS point
 *   - runZoneStateMachine()   — boosted-ride zone entry/exit tracking
 *   - runAntiSpoofChecks()    — flags suspicious GPS streams
 *   - verifyGpsBatch()        — top-level batch processor called by ingest API
 */

export const COMPLIANCE_ALGORITHM_VERSION = "v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LatLon = { lat: number; lon: number };

export type GpsPoint = {
  lat: number;
  lon: number;
  speed_kmh: number | null;
  accuracy_m: number | null;
  heading: number | null;
  recorded_at: string; // ISO timestamp
  batch_id?: string;
};

export type ZonePolygon = {
  outer: LatLon[];
  holes?: LatLon[][];
};

export type ZoneVisitState = {
  zoneId: string;
  polygon: ZonePolygon;
  state: "outside" | "entering" | "inside" | "exiting";
  enteredAt: string | null;
  /** Server clock when zone entry was confirmed (anti-spoof dwell). */
  enteredAtServer: string | null;
  pointsInZone: number;
  speedSumInZone: number;
  hasSpeedViolation: boolean;
  consecutiveInsidePoints: number;
  consecutiveOutsidePoints: number;
  boundaryOscillationCount: number;
};

export type CorridorSegment = {
  from: LatLon;
  to: LatLon;
};

export type AntiSpoofFlag = {
  flag_type:
    | "speed_violation"
    | "gps_jump"
    | "poor_accuracy"
    | "zone_boundary_abuse"
    | "stationary_in_zone"
    | "low_data_quality";
  severity: "low" | "medium" | "high" | "critical";
  metadata: Record<string, unknown>;
};

export type BatchVerificationResult = {
  acceptedPoints: (GpsPoint & { filter_status: "accepted" })[];
  rejectedPoints: (GpsPoint & { filter_status: string })[];
  zoneVisitUpdates: ZoneVisitUpdate[];
  corridorUpdate: CorridorUpdate | null;
  flags: AntiSpoofFlag[];
};

export type ZoneVisitUpdate = {
  zoneId: string;
  /** New zone_visit row to insert (zone was exited during this batch). */
  completed: {
    enteredAt: string;
    exitedAt: string;
    dwellTimeS: number;
    avgSpeedInZoneKmh: number;
    impressionUnits: number;
    pointCountInZone: number;
    speedViolation: boolean;
  } | null;
  /** Zone was entered during this batch — update state machine. */
  enteredAt: string | null;
};

export type CorridorUpdate = {
  suggestedRouteId: string;
  additionalCompliantDistanceM: number;
  additionalTotalDistanceM: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum allowed GPS accuracy — points worse than this are discarded. */
export const MAX_ACCURACY_M = 50;

/** Maximum plausible cycling speed — above this, flag and discard. */
export const MAX_SPEED_KMH = 40;

/** Maximum distance between consecutive accepted points before jump-gate fires. */
export const MAX_JUMP_DISTANCE_M = 500;

/** Minimum distance between points — below this, discard as GPS noise. */
export const MIN_POINT_DISTANCE_M = 5;

/** Zone edge buffer: distance from boundary before registering as inside (hysteresis in). */
export const ZONE_INWARD_BUFFER_M = 5;

/** Zone exit buffer: distance outside boundary before registering as exited (hysteresis out). */
export const ZONE_EXIT_BUFFER_M = 10;

/** Minimum speed inside a zone for impressions to count (km/h). */
export const MIN_ZONE_SPEED_KMH = 3;

/** Minimum continuous dwell time in a zone for the visit to produce impressions (seconds). */
export const MIN_ZONE_DWELL_S = 30;

/** Speed above which a zone visit is flagged for review. */
export const ZONE_SPEED_VIOLATION_KMH = 40;

/** Allowed future skew for client-recorded timestamps (seconds). */
export const TIMESTAMP_FUTURE_SKEW_S = 120;

/** Minimum points inside a zone before impressions can accrue. */
export const MIN_ZONE_DWELL_POINTS = 3;

/** Max impression seconds credited per accepted in-zone point. */
export const MAX_IMPRESSION_SECONDS_PER_POINT = 15;

/** Consecutive inside points required before registering zone entry. */
export const ZONE_ENTRY_CONSECUTIVE_POINTS = 2;

/** Consecutive outside points required before registering zone exit. */
export const ZONE_EXIT_CONSECUTIVE_POINTS = 2;

/** Rapid enter/exit oscillations in one batch trigger boundary abuse flag. */
export const ZONE_BOUNDARY_ABUSE_THRESHOLD = 3;

/** Fraction of in-zone points below this speed triggers stationary_in_zone. */
export const STATIONARY_ZONE_SPEED_KMH = 1.5;

/** Max gap between consecutive points in a batch (seconds). */
export const MAX_BATCH_POINT_GAP_S = 300;

// ─── Haversine ───────────────────────────────────────────────────────────────

export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const dphi = ((b.lat - a.lat) * Math.PI) / 180;
  const dlambda = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}

// ─── Point-in-Polygon (Ray Casting) ──────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Returns true if point is inside polygon (outer ring, excluding holes).
 * Used for both mobile UI and backend compliance — must stay identical.
 */
export function isPointInPolygon(point: LatLon, ring: LatLon[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

/**
 * Full polygon test supporting holes (islands of non-compliance).
 * XOR: point is inside outer ring AND outside all holes.
 */
export function isPointInZonePolygon(
  point: LatLon,
  polygon: ZonePolygon,
): boolean {
  if (!isPointInPolygon(point, polygon.outer)) return false;
  if (!polygon.holes || polygon.holes.length === 0) return true;
  // If inside any hole, the point is NOT in the zone
  for (const hole of polygon.holes) {
    if (isPointInPolygon(point, hole)) return false;
  }
  return true;
}

/**
 * Bounding-box pre-check for fast zone rejection.
 * Returns true if point is within the bounding box (not conclusive — run
 * full ray-cast after this passes).
 */
export function isPointInBoundingBox(point: LatLon, ring: LatLon[]): boolean {
  if (ring.length === 0) return false;
  let minLat = ring[0].lat;
  let maxLat = ring[0].lat;
  let minLon = ring[0].lon;
  let maxLon = ring[0].lon;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return (
    point.lat >= minLat &&
    point.lat <= maxLat &&
    point.lon >= minLon &&
    point.lon <= maxLon
  );
}

// ─── Corridor Compliance ──────────────────────────────────────────────────────

/**
 * Perpendicular distance from a point to the nearest segment of a polyline.
 * Used for standard-ride corridor compliance.
 * Returns distance in metres.
 */
export function distanceToPolyline(
  point: LatLon,
  segments: CorridorSegment[],
): number {
  if (segments.length === 0) return Infinity;

  let minDist = Infinity;
  for (const seg of segments) {
    const d = perpendicularDistanceToSegment(point, seg.from, seg.to);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function perpendicularDistanceToSegment(
  p: LatLon,
  a: LatLon,
  b: LatLon,
): number {
  // Convert to approximate Cartesian using equirectangular projection
  const scale = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const px = (p.lon - a.lon) * scale;
  const py = p.lat - a.lat;
  const dx = (b.lon - a.lon) * scale;
  const dy = b.lat - a.lat;
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq === 0) {
    // Degenerate segment (both endpoints same)
    return haversineMeters(p, a);
  }

  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / segLenSq));
  const closestLon = a.lon + (t * dx) / scale;
  const closestLat = a.lat + t * dy;
  return haversineMeters(p, { lat: closestLat, lon: closestLon });
}

/**
 * Decide whether a GPS point is inside the compliance corridor.
 * Returns true if the perpendicular distance to the route polyline ≤ toleranceM.
 */
export function checkCorridorPoint(
  point: LatLon,
  segments: CorridorSegment[],
  toleranceM: number,
): boolean {
  return distanceToPolyline(point, segments) <= toleranceM;
}

/**
 * Convert an ordered array of route waypoints into corridor segments.
 */
export function buildCorridorSegments(waypoints: LatLon[]): CorridorSegment[] {
  const segments: CorridorSegment[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    segments.push({ from: waypoints[i], to: waypoints[i + 1] });
  }
  return segments;
}

// ─── GPS Point Filters ────────────────────────────────────────────────────────

/**
 * Apply all GPS point filters. Returns the filter outcome.
 * Rules are applied in order; first failing rule wins.
 */
export function filterGpsPoint(
  point: GpsPoint,
  previousAccepted: GpsPoint | null,
): "accepted" | "accuracy_gate" | "speed_gate" | "jump_gate" | "noise_gate" | "timestamp_gate" {
  if (
    point.accuracy_m === null ||
    point.accuracy_m === undefined ||
    point.accuracy_m > MAX_ACCURACY_M
  ) {
    return "accuracy_gate";
  }

  if (
    point.speed_kmh !== null &&
    point.speed_kmh !== undefined &&
    point.speed_kmh > MAX_SPEED_KMH
  ) {
    return "speed_gate";
  }

  if (previousAccepted !== null) {
    const distM = haversineMeters(
      { lat: previousAccepted.lat, lon: previousAccepted.lon },
      { lat: point.lat, lon: point.lon },
    );
    const elapsedS =
      (new Date(point.recorded_at).getTime() -
        new Date(previousAccepted.recorded_at).getTime()) /
      1000;

    if (elapsedS <= 0) {
      return "timestamp_gate";
    }

    if (elapsedS > MAX_BATCH_POINT_GAP_S) {
      return "timestamp_gate";
    }

    const impliedSpeedKmh = (distM / elapsedS) * 3.6;
    const reportedSpeed = point.speed_kmh ?? impliedSpeedKmh;
    if (reportedSpeed > MAX_SPEED_KMH) {
      return "speed_gate";
    }

    // Jump gate: distance implausible given elapsed time
    if (distM > MAX_JUMP_DISTANCE_M && elapsedS < 30) {
      return "jump_gate";
    }

    // Noise gate: point too close to previous
    if (distM < MIN_POINT_DISTANCE_M) {
      return "noise_gate";
    }
  }

  return "accepted";
}

export function validatePointTimestamp(
  recordedAt: string,
  sessionStartedAt: string,
  serverNowMs: number = Date.now(),
): "ok" | "future_skew" | "before_session" {
  const recordedMs = new Date(recordedAt).getTime();
  const startedMs = new Date(sessionStartedAt).getTime();

  if (Number.isNaN(recordedMs) || Number.isNaN(startedMs)) {
    return "before_session";
  }

  if (recordedMs > serverNowMs + TIMESTAMP_FUTURE_SKEW_S * 1000) {
    return "future_skew";
  }

  if (recordedMs < startedMs - TIMESTAMP_FUTURE_SKEW_S * 1000) {
    return "before_session";
  }

  return "ok";
}

// ─── Zone Visit State Machine ─────────────────────────────────────────────────

/**
 * Update zone visit state for a single GPS point.
 * Applies consecutive-point hysteresis and server-clock dwell caps.
 */
export function updateZoneVisitState(
  point: GpsPoint,
  state: ZoneVisitState,
  serverNowIso: string,
): { state: ZoneVisitState; update: ZoneVisitUpdate | null } {
  const pt: LatLon = { lat: point.lat, lon: point.lon };
  const isInside = isPointInZonePolygon(pt, state.polygon);
  let completed: ZoneVisitUpdate["completed"] = null;
  let enteredAt: string | null = null;

  const newState: ZoneVisitState = {
    ...state,
    consecutiveInsidePoints: state.consecutiveInsidePoints ?? 0,
    consecutiveOutsidePoints: state.consecutiveOutsidePoints ?? 0,
    boundaryOscillationCount: state.boundaryOscillationCount ?? 0,
    enteredAtServer: state.enteredAtServer ?? null,
  };

  if (isInside) {
    newState.consecutiveInsidePoints += 1;
    newState.consecutiveOutsidePoints = 0;
  } else {
    newState.consecutiveOutsidePoints += 1;
    newState.consecutiveInsidePoints = 0;
  }

  switch (state.state) {
    case "outside":
      if (
        isInside &&
        newState.consecutiveInsidePoints >= ZONE_ENTRY_CONSECUTIVE_POINTS
      ) {
        newState.state = "inside";
        newState.enteredAt = point.recorded_at;
        newState.enteredAtServer = serverNowIso;
        newState.pointsInZone = 1;
        newState.speedSumInZone = point.speed_kmh ?? 0;
        newState.hasSpeedViolation =
          (point.speed_kmh ?? 0) > ZONE_SPEED_VIOLATION_KMH;
        enteredAt = point.recorded_at;
      }
      break;

    case "inside":
      if (
        !isInside &&
        newState.consecutiveOutsidePoints >= ZONE_EXIT_CONSECUTIVE_POINTS
      ) {
        newState.boundaryOscillationCount += 1;
        newState.state = "outside";
        const clientDwellS = Math.round(
          (new Date(point.recorded_at).getTime() -
            new Date(state.enteredAt!).getTime()) /
            1000,
        );
        const serverDwellS = state.enteredAtServer
          ? Math.round(
              (new Date(serverNowIso).getTime() -
                new Date(state.enteredAtServer).getTime()) /
                1000,
            )
          : clientDwellS;
        const dwellS = Math.min(clientDwellS, serverDwellS);
        const avgSpeed =
          state.pointsInZone > 0
            ? state.speedSumInZone / state.pointsInZone
            : 0;
        const impressions =
          dwellS >= MIN_ZONE_DWELL_S &&
          avgSpeed >= MIN_ZONE_SPEED_KMH &&
          state.pointsInZone >= MIN_ZONE_DWELL_POINTS
            ? Math.min(
                dwellS,
                state.pointsInZone * MAX_IMPRESSION_SECONDS_PER_POINT,
              )
            : 0;

        completed = {
          enteredAt: state.enteredAt!,
          exitedAt: point.recorded_at,
          dwellTimeS: dwellS,
          avgSpeedInZoneKmh: avgSpeed,
          impressionUnits: impressions,
          pointCountInZone: state.pointsInZone,
          speedViolation: state.hasSpeedViolation,
        };
        newState.enteredAt = null;
        newState.enteredAtServer = null;
        newState.pointsInZone = 0;
        newState.speedSumInZone = 0;
        newState.hasSpeedViolation = false;
      } else if (isInside) {
        newState.pointsInZone++;
        newState.speedSumInZone += point.speed_kmh ?? 0;
        if ((point.speed_kmh ?? 0) > ZONE_SPEED_VIOLATION_KMH) {
          newState.hasSpeedViolation = true;
        }
      }
      break;
  }

  return {
    state: newState,
    update: completed
      ? { zoneId: state.zoneId, completed, enteredAt: null }
      : enteredAt
        ? { zoneId: state.zoneId, completed: null, enteredAt }
        : null,
  };
}

// ─── Anti-Spoof Checks ────────────────────────────────────────────────────────

/**
 * Run anti-spoof heuristics over an entire batch of accepted GPS points.
 * Returns flags to write to session_flag table. Never throws.
 */
export function runAntiSpoofChecks(params: {
  accepted: GpsPoint[];
  totalInBatch: number;
  existingFlagTypes?: string[];
  zoneStates?: ZoneVisitState[];
  inZonePoints?: GpsPoint[];
}): AntiSpoofFlag[] {
  const { accepted, totalInBatch, zoneStates, inZonePoints } = params;
  const flags: AntiSpoofFlag[] = [];

  if (totalInBatch === 0) return flags;

  // Poor accuracy: > 20% of points in batch failed accuracy gate
  const accuracyFailures = totalInBatch - accepted.length;
  const accuracyFailurePct = accuracyFailures / totalInBatch;
  if (accuracyFailurePct > 0.2) {
    flags.push({
      flag_type: "poor_accuracy",
      severity: accuracyFailurePct > 0.5 ? "high" : "medium",
      metadata: {
        failure_pct: Math.round(accuracyFailurePct * 100),
        total_in_batch: totalInBatch,
        accepted_count: accepted.length,
      },
    });
  }

  // Speed violations: any accepted point above max speed
  const speedViolations = accepted.filter(
    (p) => (p.speed_kmh ?? 0) > MAX_SPEED_KMH,
  );
  if (speedViolations.length > 0) {
    flags.push({
      flag_type: "speed_violation",
      severity: speedViolations.length > 3 ? "critical" : "high",
      metadata: {
        violation_count: speedViolations.length,
        max_speed_kmh: Math.max(
          ...speedViolations.map((p) => p.speed_kmh ?? 0),
        ),
      },
    });
  }

  // GPS jump pattern across accepted points
  for (let i = 1; i < accepted.length; i++) {
    const prev = accepted[i - 1];
    const curr = accepted[i];
    const distM = haversineMeters(
      { lat: prev.lat, lon: prev.lon },
      { lat: curr.lat, lon: curr.lon },
    );
    const elapsedS =
      (new Date(curr.recorded_at).getTime() -
        new Date(prev.recorded_at).getTime()) /
      1000;
    if (elapsedS > 0 && distM / elapsedS > MAX_SPEED_KMH / 3.6) {
      flags.push({
        flag_type: "gps_jump",
        severity: "high",
        metadata: {
          distance_m: Math.round(distM),
          elapsed_s: Math.round(elapsedS),
          implied_speed_kmh: Math.round((distM / elapsedS) * 3.6),
        },
      });
      break;
    }
  }

  // Low data quality: fewer than 3 accepted points in a batch of 10+
  if (totalInBatch >= 10 && accepted.length < 3) {
    flags.push({
      flag_type: "low_data_quality",
      severity: "medium",
      metadata: {
        total_in_batch: totalInBatch,
        accepted_count: accepted.length,
      },
    });
  }

  if (zoneStates && zoneStates.length > 0) {
    const maxOscillation = Math.max(
      ...zoneStates.map((z) => z.boundaryOscillationCount ?? 0),
    );
    if (maxOscillation >= ZONE_BOUNDARY_ABUSE_THRESHOLD) {
      flags.push({
        flag_type: "zone_boundary_abuse",
        severity: maxOscillation >= ZONE_BOUNDARY_ABUSE_THRESHOLD * 2 ? "high" : "medium",
        metadata: {
          oscillation_count: maxOscillation,
          zone_count: zoneStates.length,
        },
      });
    }
  }

  if (inZonePoints && inZonePoints.length >= MIN_ZONE_DWELL_POINTS) {
    const stationaryCount = inZonePoints.filter(
      (p) => (p.speed_kmh ?? 0) < STATIONARY_ZONE_SPEED_KMH,
    ).length;
    const stationaryPct = stationaryCount / inZonePoints.length;
    if (stationaryPct >= 0.8) {
      flags.push({
        flag_type: "stationary_in_zone",
        severity: stationaryPct >= 0.95 ? "high" : "medium",
        metadata: {
          stationary_pct: Math.round(stationaryPct * 100),
          in_zone_points: inZonePoints.length,
        },
      });
    }
  }

  return flags;
}

// ─── Top-Level Batch Processor ────────────────────────────────────────────────

/**
 * Process a raw GPS batch through all filter and compliance checks.
 * Returns structured results for the ingest API to persist.
 *
 * @param rawPoints   - Points as received from mobile, not yet filtered
 * @param lastAccepted - The last GPS point accepted in a previous batch (for jump detection)
 * @param zoneStates  - Current zone state machine states for this session
 * @param corridorSegments - Pre-built corridor segments for standard-ride compliance
 * @param corridorToleranceM - Tolerance in metres for corridor compliance
 * @param suggestedRouteId - Route ID if session has an active bonus route
 */
export function verifyGpsBatch(params: {
  rawPoints: GpsPoint[];
  lastAccepted: GpsPoint | null;
  zoneStates: ZoneVisitState[];
  corridorSegments: CorridorSegment[];
  corridorToleranceM: number;
  suggestedRouteId: string | null;
  sessionStartedAt?: string | null;
  serverReceivedAt?: string;
}): BatchVerificationResult {
  const {
    rawPoints,
    zoneStates,
    corridorSegments,
    corridorToleranceM,
    suggestedRouteId,
    sessionStartedAt,
    serverReceivedAt = new Date().toISOString(),
  } = params;

  const acceptedPoints: (GpsPoint & { filter_status: "accepted" })[] = [];
  const rejectedPoints: (GpsPoint & { filter_status: string })[] = [];
  const inZonePoints: GpsPoint[] = [];

  let lastAccepted = params.lastAccepted;
  let prevAcceptedDist = 0;
  let corridorCompliantDist = 0;

  // Sort by recorded_at before processing (handles out-of-order batches)
  const sorted = [...rawPoints].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  // Zone state machine: work with a mutable copy
  let currentZoneStates = zoneStates.map((z) => ({
    ...z,
    consecutiveInsidePoints: z.consecutiveInsidePoints ?? 0,
    consecutiveOutsidePoints: z.consecutiveOutsidePoints ?? 0,
    boundaryOscillationCount: z.boundaryOscillationCount ?? 0,
    enteredAtServer: z.enteredAtServer ?? null,
  }));
  const zoneVisitUpdates: ZoneVisitUpdate[] = [];

  for (const point of sorted) {
    if (sessionStartedAt) {
      const timestampResult = validatePointTimestamp(
        point.recorded_at,
        sessionStartedAt,
      );
      if (timestampResult !== "ok") {
        rejectedPoints.push({
          ...point,
          filter_status: `timestamp_${timestampResult}`,
        });
        continue;
      }
    }

    const filterResult = filterGpsPoint(point, lastAccepted);

    if (filterResult !== "accepted") {
      rejectedPoints.push({ ...point, filter_status: filterResult });
      continue;
    }

    acceptedPoints.push({ ...point, filter_status: "accepted" });

    // Distance accumulation
    if (lastAccepted) {
      const segDist = haversineMeters(
        { lat: lastAccepted.lat, lon: lastAccepted.lon },
        { lat: point.lat, lon: point.lon },
      );
      prevAcceptedDist += segDist;

      // Corridor compliance (standard ride mode)
      if (corridorSegments.length > 0) {
        const inCorridor = checkCorridorPoint(
          { lat: point.lat, lon: point.lon },
          corridorSegments,
          corridorToleranceM,
        );
        if (inCorridor) corridorCompliantDist += segDist;
      }
    }

    // Zone state machine (boosted ride mode)
    const newZoneStates: ZoneVisitState[] = [];
    for (const zoneState of currentZoneStates) {
      const { state, update } = updateZoneVisitState(
        point,
        zoneState,
        serverReceivedAt,
      );
      newZoneStates.push(state);
      if (update) zoneVisitUpdates.push(update);
      if (
        state.state === "inside" &&
        isPointInZonePolygon(
          { lat: point.lat, lon: point.lon },
          state.polygon,
        )
      ) {
        inZonePoints.push(point);
      }
    }
    currentZoneStates = newZoneStates;

    lastAccepted = point;
  }

  // Anti-spoof
  const flags = runAntiSpoofChecks({
    accepted: acceptedPoints,
    totalInBatch: rawPoints.length,
    zoneStates: currentZoneStates,
    inZonePoints,
  });

  // Corridor update
  const corridorUpdate: CorridorUpdate | null =
    suggestedRouteId && corridorSegments.length > 0
      ? {
          suggestedRouteId,
          additionalCompliantDistanceM: corridorCompliantDist,
          additionalTotalDistanceM: prevAcceptedDist,
        }
      : null;

  return {
    acceptedPoints,
    rejectedPoints,
    zoneVisitUpdates,
    corridorUpdate,
    flags,
  };
}
