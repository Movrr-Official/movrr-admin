/**
 * AdminMap — Shared MapLibre Layer Definitions
 *
 * All layer specs defined once here and referenced by the AdminMap component.
 * Centralising layer definitions ensures visual consistency across view modes
 * and makes style updates a single-file change.
 */

import type { LayerProps } from "react-map-gl/maplibre";

// ─── Route zone layers (bounding-box polygons around route waypoints) ─────────

export const routeZoneFillLayer: LayerProps = {
  id: "route-zones-fill",
  type: "fill",
  source: "route-zones",
  paint: {
    "fill-color": [
      "match",
      ["get", "status"],
      "in-progress", "#10b981",
      "assigned",    "#3b82f6",
      "completed",   "#94a3b8",
      "cancelled",   "#f43f5e",
      /* default */ "#3b82f6",
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
      "in-progress", "#10b981",
      "assigned",    "#3b82f6",
      "completed",   "#94a3b8",
      "cancelled",   "#f43f5e",
      /* default */ "#3b82f6",
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
    "fill-color": "#f59e0b",
    "fill-opacity": 0.12,
  },
};

export const campaignZoneOutlineLayer: LayerProps = {
  id: "campaign-zones-outline",
  type: "line",
  source: "campaign-zones",
  paint: {
    "line-color": "#f59e0b",
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
      "standard_ride",  "#22c55e",
      "campaign",   "#f59e0b",
      "assigned",   "#3b82f6",
      /* default */ "#94a3b8",
    ],
    "line-width": 2.5,
    "line-opacity": 0.75,
    "line-dasharray": [
      "case",
      ["==", ["get", "mode"], "campaign"], ["literal", [4, 2]],
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
    "line-color": "#6366f1",
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
    "circle-color": "#6366f1",
    "circle-stroke-color": "#ffffff",
    "circle-stroke-width": 2,
  },
};

// ─── Compliance colour map (used for both markers and trails) ─────────────────

export const COMPLIANCE_COLORS: Record<string, string> = {
  compliant:     "#22c55e",  // green-500
  marginal:      "#f59e0b",  // amber-500
  non_compliant: "#ef4444",  // red-500
  paused:        "#6b7280",  // gray-500
  signal_lost:   "#374151",  // gray-700
  under_review:  "#8b5cf6",  // violet-500
} as const;

export const ROUTE_STATUS_COLORS: Record<string, string> = {
  "in-progress": "#10b981",
  assigned:      "#3b82f6",
  completed:     "#94a3b8",
  cancelled:     "#f43f5e",
} as const;
