/**
 * AdminMap — Shared MapLibre Layer Definitions
 *
 * All layer specs defined once here and referenced by the AdminMap component.
 * Centralising layer definitions ensures visual consistency across view modes
 * and makes style updates a single-file change.
 */

import type { LayerProps } from "react-map-gl/maplibre";
import { MOVRR_MAP } from "@/lib/movrr-map-colors";

// ─── Route zone layers (bounding-box polygons around route waypoints) ─────────

export const routeZoneFillLayer: LayerProps = {
  id: "route-zones-fill",
  type: "fill",
  source: "route-zones",
  paint: {
    "fill-color": [
      "match",
      ["get", "status"],
      "in-progress",
      MOVRR_MAP.signal,
      "assigned",
      MOVRR_MAP.forest,
      "completed",
      MOVRR_MAP.muted,
      "cancelled",
      MOVRR_MAP.destructive,
      /* default */ MOVRR_MAP.forest,
    ],
    "fill-opacity": 0.14,
  },
};

export const routeZoneOutlineLayer: LayerProps = {
  id: "route-zones-outline",
  type: "line",
  source: "route-zones",
  paint: {
    "line-color": [
      "match",
      ["get", "status"],
      "in-progress",
      MOVRR_MAP.signal,
      "assigned",
      MOVRR_MAP.forest,
      "completed",
      MOVRR_MAP.muted,
      "cancelled",
      MOVRR_MAP.destructive,
      /* default */ MOVRR_MAP.forest,
    ],
    "line-width": 1.5,
    "line-opacity": 0.7,
  },
};

// ─── Campaign zone layers (PostGIS polygon geometries) ────────────────────────

export const campaignZoneFillLayer: LayerProps = {
  id: "campaign-zones-fill",
  type: "fill",
  source: "campaign-zones",
  paint: {
    "fill-color": MOVRR_MAP.warning,
    "fill-opacity": 0.12,
  },
};

export const campaignZoneOutlineLayer: LayerProps = {
  id: "campaign-zones-outline",
  type: "line",
  source: "campaign-zones",
  paint: {
    "line-color": MOVRR_MAP.warning,
    "line-width": 2,
    "line-opacity": 0.8,
    "line-dasharray": [3, 1.5],
  },
};

// ─── Suggested / campaign route polylines ────────────────────────────────────

export const routeLineLayer: LayerProps = {
  id: "route-lines",
  type: "line",
  source: "route-lines",
  paint: {
    "line-color": [
      "match",
      ["get", "mode"],
      "standard_ride",
      MOVRR_MAP.signal,
      "campaign",
      MOVRR_MAP.warning,
      "assigned",
      MOVRR_MAP.forest,
      /* default */ MOVRR_MAP.muted,
    ],
    "line-width": 2.5,
    "line-opacity": 0.75,
    "line-dasharray": [
      "case",
      ["==", ["get", "mode"], "campaign"],
      ["literal", [4, 2]],
      ["literal", [1]],
    ],
  },
};

// ─── Rider GPS trail layers ───────────────────────────────────────────────────

/** Base trail — one source per rider, dynamically added in operations mode. */
export function makeTrailLayer(sessionId: string, color: string): LayerProps {
  return {
    id: `trail-layer-${sessionId}`,
    type: "line",
    source: `trail-${sessionId}`,
    paint: {
      "line-color": color,
      "line-width": 2,
      "line-opacity": 0.55,
    },
  };
}

// ─── Replay path layer ────────────────────────────────────────────────────────

export const replayPathLayer: LayerProps = {
  id: "replay-path",
  type: "line",
  source: "replay-path",
  paint: {
    "line-color": MOVRR_MAP.signal,
    "line-width": 3,
    "line-opacity": 0.8,
  },
};

export const replayHeadLayer: LayerProps = {
  id: "replay-head",
  type: "circle",
  source: "replay-head",
  paint: {
    "circle-radius": 7,
    "circle-color": MOVRR_MAP.signal,
    "circle-stroke-color": MOVRR_MAP.inverse,
    "circle-stroke-width": 2,
  },
};

// ─── Compliance colour map (used for both markers and trails) ─────────────────

export const COMPLIANCE_COLORS: Record<string, string> = {
  compliant: MOVRR_MAP.signal,
  marginal: MOVRR_MAP.warning,
  non_compliant: MOVRR_MAP.destructive,
  paused: MOVRR_MAP.muted,
  signal_lost: MOVRR_MAP.mutedStrong,
  under_review: MOVRR_MAP.forest,
} as const;

export const ROUTE_STATUS_COLORS: Record<string, string> = {
  "in-progress": MOVRR_MAP.signal,
  assigned: MOVRR_MAP.forest,
  completed: MOVRR_MAP.muted,
  cancelled: MOVRR_MAP.destructive,
} as const;
