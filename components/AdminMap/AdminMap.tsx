"use client";

/**
 * AdminMap — Unified Operations & Route Management Map
 *
 * Single MapLibre map instance serving two view modes:
 *
 *  • route-management: route bounding-box zones, status-coloured rider markers,
 *    route overlay panel, route detail drill-in (RoutePanel).
 *
 *  • operations: campaign zone polygons, GPS trails, compliance-coloured markers,
 *    real-time session drill-in (SessionPanel), session replay timeline.
 *
 * Replaces both RouteLocationsMap and LiveMap. Pass `routes` for route-management
 * mode compatibility; the map self-selects the richest data available.
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  Marker,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCcw,
  RefreshCw,
  Shield,
  Target,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  SkipBack,
} from "lucide-react";
import type { RiderRoute } from "@/schemas";
import {
  NEXT_PUBLIC_MAP_STYLE_HOT_ZONES,
  NEXT_PUBLIC_MAP_STYLE_HYBRID,
  NEXT_PUBLIC_MAP_STYLE_URL,
  NEXT_PUBLIC_MAPTILER_API_KEY,
  NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS,
} from "@/lib/env";

import { useAdminMapData } from "./useAdminMapData";
import { SessionPanel } from "./SessionPanel";
import { RoutePanel } from "./RoutePanel";
import {
  campaignZoneFillLayer,
  campaignZoneOutlineLayer,
  COMPLIANCE_COLORS,
  makeTrailLayer,
  replayHeadLayer,
  replayPathLayer,
  routeZoneFillLayer,
  routeZoneOutlineLayer,
  ROUTE_STATUS_COLORS,
} from "./layers";
import type {
  AdminMapViewMode,
  ComplianceState,
  MapStyleMode,
  ReplayFrame,
  RiderMapEntry,
} from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CENTER = { lat: 52.0705, lng: 4.3007 }; // The Hague
const JITTER = 0.03;
const REPLAY_FPS = 4; // frames per second during replay playback

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockPoint(seed: number) {
  return {
    lat: DEFAULT_CENTER.lat + (((seed * 13) % 10) / 10 - 0.5) * JITTER,
    lng: DEFAULT_CENTER.lng + (((seed * 29) % 10) / 10 - 0.5) * JITTER,
  };
}

function buildRouteZoneFeature(route: RiderRoute) {
  if (!route.waypoints?.length) return null;
  const lats = route.waypoints.map((w) => w.lat);
  const lngs = route.waypoints.map((w) => w.lng);
  const p = 0.002;
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [Math.min(...lngs) - p, Math.min(...lats) - p],
          [Math.max(...lngs) + p, Math.min(...lats) - p],
          [Math.max(...lngs) + p, Math.max(...lats) + p],
          [Math.min(...lngs) - p, Math.max(...lats) + p],
          [Math.min(...lngs) - p, Math.min(...lats) - p],
        ],
      ],
    },
    properties: { id: route.id, status: route.status },
  };
}

function routeBounds(
  route: RiderRoute,
): [[number, number], [number, number]] | null {
  if (!route.waypoints?.length) return null;
  const lats = route.waypoints.map((w) => w.lat);
  const lngs = route.waypoints.map((w) => w.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function mergeBounds(
  list: Array<[[number, number], [number, number]]>,
): [[number, number], [number, number]] | null {
  if (!list.length) return null;
  return [
    [
      Math.min(...list.map((b) => b[0][0])),
      Math.min(...list.map((b) => b[0][1])),
    ],
    [
      Math.max(...list.map((b) => b[1][0])),
      Math.max(...list.map((b) => b[1][1])),
    ],
  ];
}

function riderBounds(
  entries: RiderMapEntry[],
): [[number, number], [number, number]] | null {
  if (!entries.length) return null;
  return [
    [
      Math.min(...entries.map((r) => r.lon)),
      Math.min(...entries.map((r) => r.lat)),
    ],
    [
      Math.max(...entries.map((r) => r.lon)),
      Math.max(...entries.map((r) => r.lat)),
    ],
  ];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AdminMapProps {
  /** Routes for route-management mode (pass from RoutesOverview). */
  routes?: RiderRoute[];
  /** Default view mode. Defaults to "route-management" when routes provided, else "operations". */
  defaultMode?: AdminMapViewMode;
  /** Initial campaign filter (operations mode). */
  filterCampaignId?: string;
  /** Controlled height (CSS value). Defaults to "29rem" (matches RouteLocationsMap). */
  height?: string;
  /** When true, wraps the map in a Card shell (legacy RoutesOverview usage). */
  cardShell?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminMap({
  routes = [],
  defaultMode,
  filterCampaignId: initialCampaignFilter,
  height = "29rem",
  cardShell = false,
}: AdminMapProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const mapRef = useRef<MapRef | null>(null);
  const useMock = NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS;

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<AdminMapViewMode>(
    defaultMode ?? (routes.length > 0 ? "route-management" : "operations"),
  );

  // ── Map style ──────────────────────────────────────────────────────────────
  const [styleMode, setStyleMode] = useState<MapStyleMode>("standard");
  const [mapError, setMapError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(12);

  // When a MapTiler API key is present use satellite/terrain styles for a
  // genuinely distinct visual per mode. Falls back to OpenFreeMap vector styles
  // (no key required) so the map always renders something useful.
  const mapStyle = useMemo(() => {
    if (NEXT_PUBLIC_MAPTILER_API_KEY) {
      const key = NEXT_PUBLIC_MAPTILER_API_KEY;
      const maptiler = (style: string) =>
        `https://api.maptiler.com/maps/${style}/style.json?key=${key}`;
      if (styleMode === "hot-zones") return maptiler("topo-v2");
      if (styleMode === "hybrid") return maptiler("hybrid");
      return maptiler("streets-v2");
    }
    // OpenFreeMap fallbacks (free, no key)
    const standard =
      NEXT_PUBLIC_MAP_STYLE_URL ??
      "https://tiles.openfreemap.org/styles/liberty";
    const hotZones =
      NEXT_PUBLIC_MAP_STYLE_HOT_ZONES ??
      "https://tiles.openfreemap.org/styles/positron";
    const hybrid =
      NEXT_PUBLIC_MAP_STYLE_HYBRID ??
      "https://tiles.openfreemap.org/styles/bright";
    if (styleMode === "hot-zones") return hotZones;
    if (styleMode === "hybrid") return hybrid;
    return standard;
  }, [styleMode]);

  // ── Drill-in / selection ───────────────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  // ── Filters (operations mode) ──────────────────────────────────────────────
  const [filterCampaignId, setFilterCampaignId] = useState<string | undefined>(
    initialCampaignFilter,
  );
  const [filterRideType, setFilterRideType] = useState<
    "all" | "standard_ride" | "ad_enhanced_ride"
  >("all");
  const [filterCompliance, setFilterCompliance] = useState<
    ComplianceState | "all"
  >("all");

  // ── Replay state ───────────────────────────────────────────────────────────
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
  const [replayIdx, setReplayIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tracks whether the user explicitly closed the RoutePanel so the auto-select
  // effect does not immediately re-open it. Reset whenever the user makes an
  // explicit route selection (click on overlay or marker).
  const routePanelDismissedRef = useRef(false);

  // ── Unified data ───────────────────────────────────────────────────────────
  // Disabled in mock mode — prevents real Supabase queries from running and
  // avoids route_tracking data contaminating the mock rider display.
  const {
    riders,
    isLoading: liveLoading,
    error,
    refetch,
  } = useAdminMapData({
    routes,
    enabled: !useMock,
  });

  // In mock mode there is nothing to load; suppress the loading flag so the
  // map renders immediately with mock data rather than showing a spinner.
  const isLoading = useMock ? false : liveLoading;

  // ── Campaign zones (operations mode) ──────────────────────────────────────
  const { data: campaignZones = [] } = useQuery({
    queryKey: ["admin-map-campaign-zones", filterCampaignId],
    queryFn: async () => {
      let q = supabase
        .from("campaign_zone_geojson")
        .select("id, campaign_id, geojson");
      if (filterCampaignId) q = q.eq("campaign_id", filterCampaignId);
      const { data } = await q.limit(200);
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: viewMode === "operations",
  });

  // ── Mock rider entries (route-management mock mode) ────────────────────────
  const mockRiders = useMemo<Map<string, RiderMapEntry>>(() => {
    if (!useMock) return new Map();
    const m = new Map<string, RiderMapEntry>();
    routes
      .filter((r) => ["assigned", "in-progress"].includes(r.status))
      .forEach((r, i) => {
        const pt = mockPoint(
          r.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + i,
        );
        const key = `mock-${r.id}`;
        m.set(key, {
          sessionId: key,
          riderId: "",
          lat: pt.lat,
          lon: pt.lng,
          speedKmh: 0,
          heading: null,
          complianceState:
            r.status === "in-progress" ? "compliant" : "marginal",
          rideType: "standard_ride",
          campaignId: null,
          currentZoneIds: [],
          rewardPreview: null,
          updatedAt: r.startedAt ?? r.assignedDate ?? new Date().toISOString(),
          routeId: r.id,
          routeLabel: r.name,
          routeStatus: r.status,
          city: r.city ?? null,
          trail: [],
        });
      });
    return m;
  }, [useMock, routes]);

  const effectiveRiders = useMock ? mockRiders : riders;

  // ── Filtered riders (operations mode) ─────────────────────────────────────
  const visibleRiders = useMemo(() => {
    return [...effectiveRiders.values()].filter((r) => {
      if (viewMode === "route-management") return true;
      if (filterCampaignId && r.campaignId !== filterCampaignId) return false;
      if (filterRideType !== "all" && r.rideType !== filterRideType)
        return false;
      if (filterCompliance !== "all" && r.complianceState !== filterCompliance)
        return false;
      return true;
    });
  }, [
    effectiveRiders,
    viewMode,
    filterCampaignId,
    filterRideType,
    filterCompliance,
  ]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const compliantCount = useMemo(
    () => visibleRiders.filter((r) => r.complianceState === "compliant").length,
    [visibleRiders],
  );

  // ── GeoJSON sources ────────────────────────────────────────────────────────
  const routeZoneGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: routes
        .map(buildRouteZoneFeature)
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }),
    [routes],
  );

  const campaignZoneGeoJSON = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: campaignZones
        .map((z) => {
          try {
            const gj =
              typeof z.geojson === "string" ? JSON.parse(z.geojson) : z.geojson;
            if (!gj) return null;
            return {
              type: "Feature" as const,
              geometry: gj,
              properties: { id: z.id, status: "active" },
            };
          } catch {
            return null;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    }),
    [campaignZones],
  );

  // GPS trails per rider
  const trailSources = useMemo(() => {
    if (viewMode !== "operations") return [];
    return visibleRiders
      .filter((r) => r.trail.length > 1)
      .map((r) => ({
        id: r.sessionId,
        color: COMPLIANCE_COLORS[r.complianceState] ?? "#94a3b8",
        data: {
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: r.trail },
          properties: {},
        },
      }));
  }, [viewMode, visibleRiders]);

  // Replay path GeoJSON
  const replayPathGeoJSON = useMemo(() => {
    if (!replayFrames.length) return null;
    const visible = replayFrames.slice(0, replayIdx + 1);
    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: visible.map((f) => [f.lon, f.lat]),
      },
      properties: {},
    };
  }, [replayFrames, replayIdx]);

  const replayHeadGeoJSON = useMemo(() => {
    const frame = replayFrames[replayIdx];
    if (!frame) return null;
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [frame.lon, frame.lat] },
      properties: {},
    };
  }, [replayFrames, replayIdx]);

  // ── Route management: selected route ──────────────────────────────────────
  const routeLookup = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );

  // In route-management mode the overlay is driven by the routes prop so it
  // always renders active/assigned routes regardless of live GPS availability.
  // In operations mode it falls back to riders that carry a routeId.
  const routeOverlayItems = useMemo(() => {
    if (viewMode === "route-management") {
      return routes
        .filter((r) => ["assigned", "in-progress"].includes(r.status))
        .slice(0, 3)
        .map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          city: r.city ?? "",
          updatedAt: r.startedAt ?? r.assignedDate ?? null,
        }));
    }
    return visibleRiders
      .filter((r) => r.routeId)
      .map((r) => ({
        id: r.routeId!,
        name: r.routeLabel ?? r.routeId!,
        status: r.routeStatus ?? "assigned",
        city: r.city ?? "",
        updatedAt: r.updatedAt,
      }))
      .slice(0, 3);
  }, [routes, visibleRiders, viewMode]);

  const selectedRoute = useMemo(
    () => (selectedRouteId ? (routeLookup.get(selectedRouteId) ?? null) : null),
    [selectedRouteId, routeLookup],
  );

  // Auto-select first route overlay item when the list loads or the current
  // selection leaves the list. Skips re-selection when the user explicitly
  // closed the panel (routePanelDismissedRef.current === true).
  useEffect(() => {
    if (viewMode !== "route-management") return;
    if (routeOverlayItems.length === 0) {
      setSelectedRouteId(null);
      routePanelDismissedRef.current = false;
      return;
    }
    if (routePanelDismissedRef.current) return;
    if (
      !selectedRouteId ||
      !routeOverlayItems.find((r) => r.id === selectedRouteId)
    ) {
      setSelectedRouteId(routeOverlayItems[0].id);
    }
  }, [routeOverlayItems, selectedRouteId, viewMode]);

  // ── Map bounds ─────────────────────────────────────────────────────────────
  const riderBoundsValue = useMemo(
    () => riderBounds(visibleRiders),
    [visibleRiders],
  );
  const zoneBoundsValue = useMemo(() => {
    const list = routes
      .map(routeBounds)
      .filter((b): b is [[number, number], [number, number]] => b !== null);
    return mergeBounds(list);
  }, [routes]);

  const targetBounds = riderBoundsValue ?? zoneBoundsValue;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetBounds) return;
    map.fitBounds(targetBounds, {
      padding: { top: 64, bottom: 64, left: 64, right: 64 },
      duration: 800,
      maxZoom: 15,
    });
  }, [targetBounds]);

  // Zoom sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => setZoom(map.getZoom());
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, []);

  // ── Zoom / pan helpers ─────────────────────────────────────────────────────
  const handleZoom = useCallback(
    (delta: number) => {
      const map = mapRef.current;
      const next = Math.min(20, Math.max(2, zoom + delta));
      setZoom(next);
      map?.easeTo({ zoom: next, duration: 300 });
    },
    [zoom],
  );

  const handleResetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (targetBounds) {
      map.fitBounds(targetBounds, {
        padding: { top: 64, bottom: 64, left: 64, right: 64 },
        duration: 600,
        maxZoom: 15,
      });
    } else {
      map.easeTo({
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: 12,
        duration: 600,
      });
    }
  }, [targetBounds]);

  // ── Route selection ────────────────────────────────────────────────────────
  const handleSelectRoute = useCallback(
    (routeId: string) => {
      // Explicit user selection — allow the panel to open again.
      routePanelDismissedRef.current = false;
      setSelectedRouteId((prev) => (prev === routeId ? null : routeId));
      const route = routeLookup.get(routeId);
      const map = mapRef.current;
      const rb = route ? routeBounds(route) : null;
      if (map && rb) {
        map.fitBounds(rb, {
          padding: { top: 72, bottom: 72, left: 72, right: 72 },
          duration: 700,
          maxZoom: 15,
        });
      }
    },
    [routeLookup],
  );

  // ── Replay engine ──────────────────────────────────────────────────────────
  const startReplay = useCallback(
    async (sessionId: string) => {
      setReplayPlaying(false);
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      setReplaySessionId(sessionId);
      setReplayIdx(0);
      setSelectedSessionId(null);

      const { data } = await supabase
        .from("ride_gps_point")
        .select("lat, lon, recorded_at, compliance_state")
        .eq("session_id", sessionId)
        .eq("filter_status", "accepted")
        .order("recorded_at");

      const frames: ReplayFrame[] = (data ?? []).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        recordedAt: p.recorded_at,
        complianceState: (p.compliance_state ?? "compliant") as ComplianceState,
      }));
      setReplayFrames(frames);
      setReplayPlaying(frames.length > 0);
    },
    [supabase],
  );

  // Replay tick
  useEffect(() => {
    if (!replayPlaying || !replayFrames.length) {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
      return;
    }
    replayIntervalRef.current = setInterval(() => {
      setReplayIdx((idx) => {
        if (idx >= replayFrames.length - 1) {
          setReplayPlaying(false);
          return idx;
        }
        return idx + 1;
      });
    }, 1000 / REPLAY_FPS);
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [replayPlaying, replayFrames.length]);

  // Pan map to replay head
  useEffect(() => {
    const frame = replayFrames[replayIdx];
    if (!frame || !replaySessionId) return;
    mapRef.current?.easeTo({ center: [frame.lon, frame.lat], duration: 200 });
  }, [replayIdx, replayFrames, replaySessionId]);

  const stopReplay = useCallback(() => {
    setReplaySessionId(null);
    setReplayFrames([]);
    setReplayIdx(0);
    setReplayPlaying(false);
    if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
  }, []);

  // ── Marker colour helper ───────────────────────────────────────────────────
  function markerColor(rider: RiderMapEntry): string {
    if (viewMode === "route-management") {
      return ROUTE_STATUS_COLORS[rider.routeStatus ?? ""] ?? "#94a3b8";
    }
    return COMPLIANCE_COLORS[rider.complianceState] ?? "#94a3b8";
  }

  // ── Empty / error states ───────────────────────────────────────────────────
  const isEmpty =
    visibleRiders.length === 0 && routeZoneGeoJSON.features.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  const mapContent = (
    <div>
      {/* ── Top control bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border bg-muted/30">
        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
          <Button
            size="sm"
            variant={viewMode === "route-management" ? "default" : "ghost"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setViewMode("route-management")}
          >
            <Navigation className="h-3 w-3 mr-1" />
            Routes
          </Button>
          <Button
            size="sm"
            variant={viewMode === "operations" ? "default" : "ghost"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setViewMode("operations")}
          >
            <Shield className="h-3 w-3 mr-1" />
            Operations
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {visibleRiders.length} active
          </span>
          {viewMode === "operations" && (
            <span>
              {compliantCount}/{visibleRiders.length} compliant
            </span>
          )}
          {useMock && (
            <Badge variant="outline" className="text-[10px] h-5">
              Mock
            </Badge>
          )}
        </div>
      </div>

      {/* ── Map canvas ── */}
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted/30"
        style={{ height }}
      >
        {/* Background gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.1),_transparent_55%)] pointer-events-none z-[1]" />
        {useMock && (
          <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(148,163,184,0.4)_1px,_transparent_1px)] [background-size:18px_18px] opacity-30 pointer-events-none z-[1]" />
        )}

        {isLoading && !useMock ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground z-10">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <p className="text-sm">Loading live locations…</p>
          </div>
        ) : (error || mapError) && !useMock ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground z-10">
            <TriangleAlert className="h-5 w-5" />
            <p className="text-sm">Unable to load map.</p>
            <p className="text-xs">
              {mapError ?? "Check the live tracking service."}
            </p>
            <Button size="sm" variant="outline" onClick={refetch}>
              Retry
            </Button>
          </div>
        ) : isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10">
            <MapPin className="h-6 w-6" />
            <p className="mt-2 text-sm">No active riders</p>
          </div>
        ) : null}

        <MapGL
          ref={mapRef}
          initialViewState={{
            latitude: DEFAULT_CENTER.lat,
            longitude: DEFAULT_CENTER.lng,
            zoom: 12,
          }}
          mapStyle={mapStyle}
          reuseMaps
          dragRotate={false}
          onError={(e) => setMapError(e.error?.message ?? "Map failed to load")}
          attributionControl={{ compact: true }}
          style={{ width: "100%", height: "100%" }}
        >
          {/* ── Route management layers ── */}
          {viewMode === "route-management" && (
            <Source id="route-zones" type="geojson" data={routeZoneGeoJSON}>
              <Layer {...routeZoneFillLayer} />
              <Layer {...routeZoneOutlineLayer} />
            </Source>
          )}

          {/* ── Operations layers ── */}
          {viewMode === "operations" && (
            <>
              <Source
                id="campaign-zones"
                type="geojson"
                data={campaignZoneGeoJSON}
              >
                <Layer {...campaignZoneFillLayer} />
                <Layer {...campaignZoneOutlineLayer} />
              </Source>

              {/* GPS trails per rider */}
              {trailSources.map((t) => (
                <Source
                  key={`trail-src-${t.id}`}
                  id={`trail-${t.id}`}
                  type="geojson"
                  data={t.data}
                >
                  <Layer {...makeTrailLayer(t.id, t.color)} />
                </Source>
              ))}
            </>
          )}

          {/* ── Replay overlay ── */}
          {replaySessionId && replayPathGeoJSON && (
            <>
              <Source id="replay-path" type="geojson" data={replayPathGeoJSON}>
                <Layer {...replayPathLayer} />
              </Source>
              {replayHeadGeoJSON && (
                <Source
                  id="replay-head"
                  type="geojson"
                  data={replayHeadGeoJSON}
                >
                  <Layer {...replayHeadLayer} />
                </Source>
              )}
            </>
          )}

          {/* ── Rider markers ── */}
          {!replaySessionId &&
            visibleRiders.map((rider) => {
              const color = markerColor(rider);
              const isSelected =
                viewMode === "operations"
                  ? rider.sessionId === selectedSessionId
                  : rider.routeId === selectedRouteId;

              return (
                <Marker
                  key={rider.sessionId}
                  latitude={rider.lat}
                  longitude={rider.lon}
                  anchor="center"
                  onClick={() => {
                    if (viewMode === "operations") {
                      setSelectedSessionId((prev) =>
                        prev === rider.sessionId ? null : rider.sessionId,
                      );
                    } else if (rider.routeId) {
                      handleSelectRoute(rider.routeId);
                    }
                  }}
                >
                  <div className="flex flex-col items-center cursor-pointer">
                    <span
                      className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-md transition-transform"
                      style={{
                        backgroundColor: color,
                        transform: isSelected ? "scale(1.5)" : "scale(1)",
                        boxShadow: isSelected
                          ? `0 0 0 3px ${color}55, 0 2px 4px rgba(0,0,0,0.3)`
                          : "0 2px 4px rgba(0,0,0,0.3)",
                      }}
                    />
                    {(isSelected || viewMode === "route-management") && (
                      <span className="mt-1.5 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow whitespace-nowrap">
                        {rider.routeLabel ?? rider.sessionId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </Marker>
              );
            })}
        </MapGL>

        {/* ── Map style switcher (top-left, inside map) ── */}
        <div className="absolute left-3 top-3 z-10 pointer-events-auto">
          <div className="flex flex-col gap-1 rounded-lg bg-background/95 border border-border shadow-lg p-1">
            <button
              onClick={() => setStyleMode("standard")}
              aria-label="Standard map"
              title="Standard"
              className={[
                "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                styleMode === "standard"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <MapIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStyleMode("hot-zones")}
              aria-label="High-contrast zone map"
              title="Hot zones — minimal style, zones and markers stand out"
              className={[
                "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                styleMode === "hot-zones"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Target className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStyleMode("hybrid")}
              aria-label="Detailed map"
              title="Hybrid — vivid style with full road and terrain detail"
              className={[
                "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                styleMode === "hybrid"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Layers className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Zoom / reset controls (left side, below style switcher) ── */}
        <div className="absolute left-3 bottom-8 z-10 flex flex-col gap-1 pointer-events-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 bg-background/95 shadow"
            onClick={() => handleZoom(1)}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 bg-background/95 shadow"
            onClick={() => handleZoom(-1)}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 bg-background/95 shadow"
            onClick={handleResetView}
            aria-label="Reset view"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Route management: route overlay panel (top-right) ── */}
        {viewMode === "route-management" && routeOverlayItems.length > 0 && (
          <div className="absolute right-3 top-3 z-10 w-60 rounded-xl bg-background/95 border border-border shadow-lg p-3 pointer-events-auto max-h-[calc(100%-1.5rem)] overflow-y-auto">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Active Routes
            </h5>
            <div className="space-y-2">
              {routeOverlayItems.map((route) => (
                <button
                  key={route.id}
                  className={[
                    "w-full rounded-lg px-3 py-2 text-left transition flex items-start justify-between gap-2",
                    route.id === selectedRouteId
                      ? "ring-2 ring-emerald-400/60"
                      : "",
                    route.status === "in-progress"
                      ? "bg-emerald-500 text-white"
                      : route.status === "assigned"
                        ? "bg-blue-500 text-white"
                        : "bg-muted/50 text-foreground",
                  ].join(" ")}
                  onClick={() => handleSelectRoute(route.id)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {route.name}
                    </p>
                    <p
                      className={`text-[10px] truncate ${route.status === "in-progress" || route.status === "assigned" ? "text-white/70" : "text-muted-foreground"}`}
                    >
                      {route.city}
                      {route.updatedAt
                        ? ` · ${new Date(route.updatedAt).toLocaleTimeString()}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${route.status === "in-progress" || route.status === "assigned" ? "bg-white/20 text-white" : "bg-background text-foreground"}`}
                  >
                    {route.status === "in-progress"
                      ? "Live"
                      : route.status === "assigned"
                        ? "Assigned"
                        : route.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Operations: compliance legend ── */}
        {viewMode === "operations" && (
          <div className="absolute left-3 top-3 z-10 rounded-lg bg-background/95 border border-border shadow p-2 pointer-events-none">
            <div className="flex flex-col gap-1">
              {Object.entries(COMPLIANCE_COLORS).map(([state, color]) => (
                <span
                  key={state}
                  className="flex items-center gap-1.5 text-[10px] text-foreground"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {state.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Session drill-in panel (operations) ── */}
        {viewMode === "operations" &&
          selectedSessionId &&
          effectiveRiders.get(selectedSessionId) && (
            <SessionPanel
              rider={effectiveRiders.get(selectedSessionId)!}
              onClose={() => setSelectedSessionId(null)}
              onStartReplay={startReplay}
            />
          )}

        {/* ── Route drill-in panel (route-management) ── */}
        {viewMode === "route-management" && selectedRoute && (
          <RoutePanel
            route={selectedRoute}
            onClose={() => {
              routePanelDismissedRef.current = true;
              setSelectedRouteId(null);
            }}
          />
        )}

        {/* ── Replay controls ── */}
        {replaySessionId && replayFrames.length > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-background border border-border shadow-xl px-4 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setReplayIdx(0)}
              aria-label="Restart"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setReplayPlaying((p) => !p)}
              aria-label={replayPlaying ? "Pause" : "Play"}
            >
              {replayPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>

            <input
              type="range"
              min={0}
              max={replayFrames.length - 1}
              value={replayIdx}
              onChange={(e) => {
                setReplayPlaying(false);
                setReplayIdx(Number(e.target.value));
              }}
              className="w-48 h-1 accent-indigo-500"
            />

            <span className="text-[10px] text-muted-foreground tabular-nums w-28">
              {replayFrames[replayIdx]
                ? new Date(
                    replayFrames[replayIdx].recordedAt,
                  ).toLocaleTimeString()
                : "—"}
            </span>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={stopReplay}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  if (cardShell) {
    return (
      <div
        className="relative w-full rounded-lg overflow-hidden border-0 bg-card shadow animate-slide-up glass-card"
        style={{ animationDelay: "0.6s" }}
      >
        {/* CardHeader equivalent */}
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Live Route Map
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {useMock
                ? "Mock rider positions based on route waypoints."
                : "Live GPS positions via Supabase Realtime."}
            </p>
          </div>
          <Badge variant={useMock ? "mock" : isLoading ? "info" : "success"}>
            {useMock
              ? `Mock · ${visibleRiders.length} active`
              : isLoading
                ? "Syncing…"
                : `${visibleRiders.length} active`}
          </Badge>
        </div>
        {/* CardContent equivalent — matches original space-y-4 and p-6 */}
        <div className="px-6 pb-6 space-y-4">{mapContent}</div>
      </div>
    );
  }

  return mapContent;
}
