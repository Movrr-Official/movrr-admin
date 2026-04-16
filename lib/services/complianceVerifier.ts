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
 *   - checkCorridorPoint()    — free-ride compliance decision per GPS point
 *   - runZoneStateMachine()   — campaign-ride zone entry/exit tracking
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
  pointsInZone: number;
  speedSumInZone: number;
  hasSpeedViolation: boolean;
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
 * Used for free-ride corridor compliance.
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
): "accepted" | "accuracy_gate" | "speed_gate" | "jump_gate" | "noise_gate" {
  // Accuracy gate
  if (
    point.accuracy_m !== null &&
    point.accuracy_m !== undefined &&
    point.accuracy_m > MAX_ACCURACY_M
  ) {
    return "accuracy_gate";
  }

  // Speed gate (flag and discard — anti-motorised-vehicle)
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

// ─── Zone Visit State Machine ─────────────────────────────────────────────────

/**
 * Update zone visit state for a single GPS point.
 * Applies inward (5m) and outward (10m) hysteresis buffers to prevent
 * boundary bounce. Returns a completed ZoneVisitUpdate if a visit ended.
 */
export function updateZoneVisitState(
  point: GpsPoint,
  state: ZoneVisitState,
  now: string,
): { state: ZoneVisitState; update: ZoneVisitUpdate | null } {
  const pt: LatLon = { lat: point.lat, lon: point.lon };
  const isInside = isPointInZonePolygon(pt, state.polygon);
  let completed: ZoneVisitUpdate["completed"] = null;
  let enteredAt: string | null = null;

  const newState = { ...state };

  switch (state.state) {
    case "outside":
      if (isInside) {
        newState.state = "inside";
        newState.enteredAt = point.recorded_at;
        newState.pointsInZone = 1;
        newState.speedSumInZone = point.speed_kmh ?? 0;
        newState.hasSpeedViolation =
          (point.speed_kmh ?? 0) > ZONE_SPEED_VIOLATION_KMH;
        enteredAt = point.recorded_at;
      }
      break;

    case "inside":
      if (!isInside) {
        // Apply exit hysteresis: check if point is actually outside by
        // more than ZONE_EXIT_BUFFER_M. For simplicity, we treat a single
        // point outside the polygon as the exit trigger (PostGIS-level buffer
        // is applied during zone import). State machine stays simple.
        newState.state = "outside";
        const dwellS = Math.round(
          (new Date(point.recorded_at).getTime() -
            new Date(state.enteredAt!).getTime()) /
            1000,
        );
        const avgSpeed =
          state.pointsInZone > 0
            ? state.speedSumInZone / state.pointsInZone
            : 0;
        // Only count impressions for moving dwell time above minimum
        const impressions =
          dwellS >= MIN_ZONE_DWELL_S && avgSpeed >= MIN_ZONE_SPEED_KMH
            ? dwellS
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
        newState.pointsInZone = 0;
        newState.speedSumInZone = 0;
        newState.hasSpeedViolation = false;
      } else {
        // Still inside — accumulate metrics
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
}): AntiSpoofFlag[] {
  const { accepted, totalInBatch } = params;
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
 * @param corridorSegments - Pre-built corridor segments for free-ride compliance
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
}): BatchVerificationResult {
  const {
    rawPoints,
    zoneStates,
    corridorSegments,
    corridorToleranceM,
    suggestedRouteId,
  } = params;

  const acceptedPoints: (GpsPoint & { filter_status: "accepted" })[] = [];
  const rejectedPoints: (GpsPoint & { filter_status: string })[] = [];

  let lastAccepted = params.lastAccepted;
  let prevAcceptedDist = 0;
  let corridorCompliantDist = 0;

  // Sort by recorded_at before processing (handles out-of-order batches)
  const sorted = [...rawPoints].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  // Zone state machine: work with a mutable copy
  let currentZoneStates = [...zoneStates.map((z) => ({ ...z }))];
  const zoneVisitUpdates: ZoneVisitUpdate[] = [];

  for (const point of sorted) {
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
        point.recorded_at,
      );
      newZoneStates.push(state);
      if (update) zoneVisitUpdates.push(update);
    }
    currentZoneStates = newZoneStates;

    lastAccepted = point;
  }

  // Anti-spoof
  const flags = runAntiSpoofChecks({
    accepted: acceptedPoints,
    totalInBatch: rawPoints.length,
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
