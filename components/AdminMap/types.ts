/**
 * AdminMap — Shared Types
 */

// ─── View modes ───────────────────────────────────────────────────────────────

/** Route Management: route coverage, waypoints, route status, historical GPS.
 *  Operations: live compliance state, zone dwell, anti-spoof flags, session replay. */
export type AdminMapViewMode = "route-management" | "operations";

export type MapStyleMode = "standard" | "hot-zones" | "hybrid";

// ─── Rider state ──────────────────────────────────────────────────────────────

export type ComplianceState =
  | "compliant"
  | "marginal"
  | "non_compliant"
  | "paused"
  | "signal_lost"
  | "under_review";

/** Unified rider position — merged from Realtime broadcast + route_tracking poll. */
export type RiderMapEntry = {
  /** Supabase ride_session.id — authoritative key */
  sessionId: string;
  riderId: string;
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number | null;
  /** Compliance state from backend-verified data (operations mode). */
  complianceState: ComplianceState;
  /** Ride type: standard_ride | ad_enhanced_ride */
  rideType: string;
  campaignId: string | null;
  currentZoneIds: string[];
  rewardPreview: number | null;
  updatedAt: string;
  // Route management fields (populated when tied to a rider_route)
  routeId?: string | null;
  routeLabel?: string | null;
  routeStatus?: string | null;
  city?: string | null;
  // GPS trail (last N accepted points, populated lazily in operations mode)
  trail: [number, number][]; // [lon, lat] pairs — MapLibre coordinate order
};

// ─── Zone / route overlays ────────────────────────────────────────────────────

export type ZoneFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  {
    id: string;
    status: string;
    label?: string;
  }
>;

export type RouteLineFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  {
    id: string;
    label: string;
    mode: "standard_ride" | "campaign" | "assigned";
  }
>;

// ─── Drill-in panels ──────────────────────────────────────────────────────────

export type DrillInTarget =
  | { kind: "session"; sessionId: string }
  | { kind: "route"; routeId: string };

// ─── Replay ──────────────────────────────────────────────────────────────────

export type ReplayFrame = {
  lat: number;
  lon: number;
  recordedAt: string;
  complianceState: ComplianceState;
};
