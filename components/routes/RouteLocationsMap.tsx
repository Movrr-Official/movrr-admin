"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  NavigationControl,
  MapRef,
  Source,
  Layer,
  Marker,
} from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  RefreshCw,
  TriangleAlert,
  Navigation,
  Layers,
  RefreshCcw,
  Target,
  ZoomOut,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RiderRoute } from "@/schemas";
import { useRiderLocations } from "@/hooks/useRiderLocations";
import {
  NEXT_PUBLIC_MAP_STYLE_HOT_ZONES,
  NEXT_PUBLIC_MAP_STYLE_HYBRID,
  NEXT_PUBLIC_MAP_STYLE_URL,
  NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS,
} from "@/lib/env";

const THE_HAGUE_CENTER = { lat: 52.0705, lng: 4.3007 };
const THE_HAGUE_JITTER = 0.03;

const getTheHagueMockPoint = (seed: number) => {
  const jitterLat = ((seed * 13) % 10) / 10 - 0.5;
  const jitterLng = ((seed * 29) % 10) / 10 - 0.5;

  return {
    lat: THE_HAGUE_CENTER.lat + jitterLat * THE_HAGUE_JITTER,
    lng: THE_HAGUE_CENTER.lng + jitterLng * THE_HAGUE_JITTER,
  };
};

type RiderLocation = {
  id: string;
  routeId?: string | null;
  label: string;
  city: string;
  status: string;
  lat: number;
  lng: number;
  updatedAt?: string | null;
};

const getLatestWaypoint = (route: RiderRoute) => {
  if (!route.waypoints?.length) return null;
  return route.waypoints.reduce((latest, current) =>
    current.order > latest.order ? current : latest,
  );
};

const buildRouteZonePolygon = (route: RiderRoute) => {
  if (!route.waypoints?.length) return null;

  const latitudes = route.waypoints.map((point) => point.lat);
  const longitudes = route.waypoints.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const padding = 0.002;

  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [minLng - padding, minLat - padding],
          [maxLng + padding, minLat - padding],
          [maxLng + padding, maxLat + padding],
          [minLng - padding, maxLat + padding],
          [minLng - padding, minLat - padding],
        ],
      ],
    },
    properties: {
      id: route.id,
      status: route.status,
    },
  };
};

const getRouteBounds = (route: RiderRoute) => {
  if (!route.waypoints?.length) return null;
  const latitudes = route.waypoints.map((point) => point.lat);
  const longitudes = route.waypoints.map((point) => point.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
};

const mergeBounds = (
  boundsList: Array<[[number, number], [number, number]]>,
) => {
  if (boundsList.length === 0) return null;
  const minLng = Math.min(...boundsList.map((b) => b[0][0]));
  const minLat = Math.min(...boundsList.map((b) => b[0][1]));
  const maxLng = Math.max(...boundsList.map((b) => b[1][0]));
  const maxLat = Math.max(...boundsList.map((b) => b[1][1]));
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
};

export function RouteLocationsMap({ routes }: { routes: RiderRoute[] }) {
  const useMockData = NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS;
  const mapRef = useRef<MapRef | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [mapMode, setMapMode] = useState<
    "campaign-zones" | "hot-zones" | "hybrid"
  >("campaign-zones");
  const [zoom, setZoom] = useState<number>(12);

  const activeRoutes = useMemo(
    () =>
      routes.filter((route) =>
        ["assigned", "in-progress"].includes(route.status),
      ),
    [routes],
  );
  const activeRouteIds = useMemo(
    () => activeRoutes.map((route) => route.id),
    [activeRoutes],
  );

  const routeLookup = useMemo(
    () => new Map(routes.map((route) => [route.id, route])),
    [routes],
  );

  const {
    data: liveLocations = [],
    isLoading,
    error,
  } = useRiderLocations(activeRouteIds);

  const mockLocations = useMemo<RiderLocation[]>(
    () =>
      activeRoutes
        .map((route) => {
          const waypoint = getLatestWaypoint(route);
          if (!waypoint) return null;
          const mockPoint = getTheHagueMockPoint(
            route.id
              .split("")
              .reduce((sum, char) => sum + char.charCodeAt(0), 0),
          );
          return {
            id: route.id,
            routeId: route.id,
            label: route.name,
            city: "The Hague",
            status: route.status,
            lat: mockPoint.lat,
            lng: mockPoint.lng,
            updatedAt: route.startedAt ?? route.assignedDate,
          } satisfies RiderLocation;
        })
        .filter(Boolean) as RiderLocation[],
    [activeRoutes],
  );

  const locations = useMemo<RiderLocation[]>(() => {
    if (useMockData) {
      return mockLocations;
    }

    return liveLocations
      .map((loc) => {
        if (!loc.routeId) return null;
        const route = routeLookup.get(loc.routeId);
        return {
          id: loc.routeId,
          routeId: loc.routeId,
          label: route?.name ?? `Rider ${loc.riderId ?? ""}`.trim(),
          city: route?.city ?? "Unknown",
          status: route?.status ?? "assigned",
          lat: loc.lat,
          lng: loc.lng,
          updatedAt: loc.recordedAt,
        } satisfies RiderLocation;
      })
      .filter(Boolean) as RiderLocation[];
  }, [liveLocations, mockLocations, routeLookup, useMockData]);

  const latitudes = locations.map((loc) => loc.lat);
  const longitudes = locations.map((loc) => loc.lng);

  const bounds = useMemo(() => {
    if (!locations.length) return null;
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ] as [[number, number], [number, number]];
  }, [latitudes, longitudes, locations.length]);

  const mapStyle = useMemo(() => {
    const baseStyle =
      NEXT_PUBLIC_MAP_STYLE_URL ??
      "https://tiles.openfreemap.org/styles/liberty";
    const hotZonesStyle = NEXT_PUBLIC_MAP_STYLE_HOT_ZONES ?? baseStyle;
    const hybridStyle = NEXT_PUBLIC_MAP_STYLE_HYBRID ?? baseStyle;

    if (mapMode === "hot-zones") return hotZonesStyle;
    if (mapMode === "hybrid") return hybridStyle;
    return baseStyle;
  }, [mapMode]);

  const routeOverlayItems = useMemo(
    () =>
      locations
        .map((loc) => ({
          id: loc.id,
          name: loc.label,
          status: loc.status,
          city: loc.city,
          updatedAt: loc.updatedAt,
        }))
        .slice(0, 3),
    [locations],
  );

  const riderMarkers = useMemo(
    () =>
      locations.map((loc) => ({
        id: loc.id,
        lat: loc.lat,
        lng: loc.lng,
        label: loc.label,
        status: loc.status,
      })),
    [locations],
  );

  const zoneSourceData = useMemo(() => {
    const features = routes
      .map((route) => buildRouteZonePolygon(route))
      .filter((feature): feature is NonNullable<typeof feature> =>
        Boolean(feature),
      );

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [routes]);

  const zoneBounds = useMemo(() => {
    const boundsList = routes
      .map((route) => getRouteBounds(route))
      .filter((bounds): bounds is [[number, number], [number, number]] =>
        Boolean(bounds),
      );
    return mergeBounds(boundsList);
  }, [routes]);

  const zoneFillLayer: LayerProps = useMemo(
    () => ({
      id: "route-zones-fill",
      type: "fill",
      source: "route-zones",
      paint: {
        "fill-color": [
          "match",
          ["get", "status"],
          "in-progress",
          "#10b981",
          "assigned",
          "#3b82f6",
          "completed",
          "#94a3b8",
          "cancelled",
          "#f43f5e",
          "#3b82f6",
        ],
        "fill-opacity": 0.18,
      },
    }),
    [],
  );

  const zoneOutlineLayer: LayerProps = useMemo(
    () => ({
      id: "route-zones-outline",
      type: "line",
      source: "route-zones",
      paint: {
        "line-color": [
          "match",
          ["get", "status"],
          "in-progress",
          "#10b981",
          "assigned",
          "#3b82f6",
          "completed",
          "#94a3b8",
          "cancelled",
          "#f43f5e",
          "#3b82f6",
        ],
        "line-width": 2,
        "line-opacity": 0.7,
      },
    }),
    [],
  );

  const selectedRoute = useMemo(() => {
    if (!selectedRouteId) {
      return null;
    }
    return routeLookup.get(selectedRouteId) ?? null;
  }, [routeLookup, selectedRouteId]);

  const difficultyLabel = useMemo(() => {
    if (!selectedRoute) return "—";
    if (selectedRoute.difficulty) return selectedRoute.difficulty;
    if (selectedRoute.performance === "high") return "Hard";
    if (selectedRoute.performance === "medium") return "Medium";
    if (selectedRoute.performance === "low") return "Easy";
    return "—";
  }, [selectedRoute]);

  const formatStatus = (status: string) => {
    if (status === "in-progress") return "In progress";
    if (status === "assigned") return "Assigned";
    if (status === "completed") return "Completed";
    if (status === "cancelled") return "Cancelled";
    return status;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const targetBounds = bounds ?? zoneBounds;
    if (!targetBounds) return;
    map.fitBounds(targetBounds, {
      padding: { top: 48, bottom: 48, left: 48, right: 48 },
      duration: 800,
      maxZoom: 14,
    });
    setZoom(map.getZoom());
  }, [bounds, zoneBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleMove = () => {
      setZoom(map.getZoom());
    };
    map.on("move", handleMove);
    return () => {
      map.off("move", handleMove);
    };
  }, []);

  const handleZoom = (nextZoom: number) => {
    const map = mapRef.current;
    const clamped = Math.min(18, Math.max(2, nextZoom));
    setZoom(clamped);
    map?.easeTo({ zoom: clamped, duration: 300 });
  };

  const handleResetView = () => {
    const map = mapRef.current;
    if (bounds && map) {
      map.fitBounds(bounds, {
        padding: { top: 48, bottom: 48, left: 48, right: 48 },
        duration: 600,
        maxZoom: 14,
      });
      return;
    }
    map?.easeTo({
      center: [THE_HAGUE_CENTER.lng, THE_HAGUE_CENTER.lat],
      zoom: 12,
      duration: 600,
    });
  };

  const handleSelectRoute = (routeId: string) => {
    if (selectedRouteId === routeId) {
      setShowRouteDetails((prev) => !prev);
      return;
    }
    setSelectedRouteId(routeId);
    setShowRouteDetails(true);
    const route = routeLookup.get(routeId);
    if (!route) return;
    const map = mapRef.current;
    const routeBounds = getRouteBounds(route);
    if (map && routeBounds) {
      map.fitBounds(routeBounds, {
        padding: { top: 64, bottom: 64, left: 64, right: 64 },
        duration: 700,
        maxZoom: 15,
      });
    }
  };

  useEffect(() => {
    if (routeOverlayItems.length === 0) {
      setSelectedRouteId(null);
      setShowRouteDetails(false);
      return;
    }

    if (!selectedRouteId) {
      setSelectedRouteId(routeOverlayItems[0].id);
      return;
    }

    const exists = routeOverlayItems.some(
      (route) => route.id === selectedRouteId,
    );
    if (!exists) {
      setSelectedRouteId(routeOverlayItems[0].id);
      setShowRouteDetails(false);
    }
  }, [routeOverlayItems, selectedRouteId]);

  return (
    <Card
      className="relative w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden glass-card border-0 animate-slide-up"
      style={{ animationDelay: "0.6s" }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg font-bold">Live Route Map</CardTitle>
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
            {useMockData
              ? `Mock · ${locations.length} active`
              : isLoading
                ? "Syncing..."
                : `${locations.length} active`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {useMockData
            ? "Mock rider positions based on route waypoints."
            : "Live GPS points streamed from Movrr’s backend route tracking service."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-[29rem] w-full overflow-hidden rounded-2xl border border-border bg-muted/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(15,23,42,0.05)_0%,_transparent_60%)] dark:bg-[linear-gradient(120deg,_rgba(148,163,184,0.08)_0%,_transparent_60%)]" />
          {useMockData && (
            <div className="absolute inset-0 bg-[radial-gradient(circle,_rgba(148,163,184,0.4)_1px,_transparent_1px)] [background-size:18px_18px] opacity-40" />
          )}

          {useMockData ? (
            <MapGL
              ref={mapRef}
              initialViewState={{
                latitude:
                  locations[0]?.lat ??
                  zoneBounds?.[0][1] ??
                  THE_HAGUE_CENTER.lat,
                longitude:
                  locations[0]?.lng ??
                  zoneBounds?.[0][0] ??
                  THE_HAGUE_CENTER.lng,
                zoom: locations.length ? 12 : 10,
              }}
              mapStyle={mapStyle}
              reuseMaps
              dragRotate={false}
              onError={(event) =>
                setMapError(event.error?.message ?? "Map failed to load")
              }
              attributionControl={{ compact: true }}
            >
              <Source id="route-zones" type="geojson" data={zoneSourceData}>
                <Layer {...zoneFillLayer} />
                <Layer {...zoneOutlineLayer} />
              </Source>
              {riderMarkers.map((marker) => (
                <Marker
                  key={`rider-${marker.id}`}
                  latitude={marker.lat}
                  longitude={marker.lng}
                  anchor="center"
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "h-3.5 w-3.5 rounded-full ring-4 ring-opacity-30 shadow " +
                        (marker.status === "in-progress"
                          ? "bg-emerald-500 ring-emerald-200"
                          : marker.status === "assigned"
                            ? "bg-blue-500 ring-blue-200"
                            : "bg-slate-500 ring-slate-200")
                      }
                    />
                    <span className="mt-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow">
                      {marker.label}
                    </span>
                  </div>
                </Marker>
              ))}
            </MapGL>
          ) : isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <p className="text-sm">Loading live locations...</p>
            </div>
          ) : error || mapError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <TriangleAlert className="h-5 w-5" />
              <p className="text-sm">Unable to load live rider map.</p>
              <p className="text-xs text-muted-foreground">
                {mapError ?? "Please check the live tracking service."}
              </p>
            </div>
          ) : locations.length === 0 && zoneSourceData.features.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <MapPin className="h-6 w-6" />
              <p className="mt-2 text-sm">No live rider locations available</p>
            </div>
          ) : (
            <MapGL
              ref={mapRef}
              initialViewState={{
                latitude:
                  locations[0]?.lat ??
                  zoneBounds?.[0][1] ??
                  THE_HAGUE_CENTER.lat,
                longitude:
                  locations[0]?.lng ??
                  zoneBounds?.[0][0] ??
                  THE_HAGUE_CENTER.lng,
                zoom: locations.length ? 11 : 10,
              }}
              mapStyle={mapStyle}
              reuseMaps
              dragRotate={false}
              onError={(event) =>
                setMapError(event.error?.message ?? "Map failed to load")
              }
              attributionControl={{ compact: true }}
            >
              <NavigationControl position="top-right" showCompass={false} />
              <Source id="route-zones" type="geojson" data={zoneSourceData}>
                <Layer {...zoneFillLayer} />
                <Layer {...zoneOutlineLayer} />
              </Source>
              {riderMarkers.map((marker) => (
                <Marker
                  key={`rider-${marker.id}`}
                  latitude={marker.lat}
                  longitude={marker.lng}
                  anchor="center"
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "h-3.5 w-3.5 rounded-full ring-4 ring-opacity-30 shadow " +
                        (marker.status === "in-progress"
                          ? "bg-emerald-500 ring-emerald-200"
                          : marker.status === "assigned"
                            ? "bg-blue-500 ring-blue-200"
                            : "bg-slate-500 ring-slate-200")
                      }
                    />
                    <span className="mt-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow">
                      {marker.label}
                    </span>
                  </div>
                </Marker>
              ))}
            </MapGL>
          )}

          <div className="absolute left-4 top-4 z-10 flex flex-col gap-3 pointer-events-auto">
            <div className="bg-card rounded-lg shadow-lg p-2 flex space-x-1">
              <Button
                variant={mapMode === "campaign-zones" ? "default" : "outline"}
                size="sm"
                onClick={() => setMapMode("campaign-zones")}
              >
                <Navigation className="h-4 w-4" />
              </Button>
              <Button
                variant={mapMode === "hot-zones" ? "default" : "outline"}
                size="sm"
                onClick={() => setMapMode("hot-zones")}
              >
                <Target className="h-4 w-4" />
              </Button>
              <Button
                variant={mapMode === "hybrid" ? "default" : "outline"}
                size="sm"
                onClick={() => setMapMode("hybrid")}
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>
            <div className="bg-card rounded-lg shadow-lg p-2 flex flex-col space-y-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(zoom + 1)}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleZoom(zoom - 1)}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetView}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="absolute right-4 top-4 w-64 rounded-2xl bg-background/95 shadow-lg border border-border p-4 pointer-events-auto">
            <h5 className="text-sm font-semibold text-foreground mb-3">
              Routes
            </h5>
            <div className="space-y-3">
              {routeOverlayItems.map((route) => (
                <div
                  key={route.id}
                  className={
                    "rounded-xl px-3 py-2 flex items-start justify-between gap-3 cursor-pointer transition " +
                    (route.id === selectedRouteId
                      ? "ring-2 ring-emerald-300/70"
                      : "") +
                    (route.status === "in-progress"
                      ? " bg-emerald-500 text-white"
                      : route.status === "assigned"
                        ? " bg-blue-500 text-white"
                        : " bg-muted/40 text-foreground")
                  }
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectRoute(route.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectRoute(route.id);
                    }
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {route.name}
                    </p>
                    <p
                      className={
                        "text-[11px] " +
                        (route.status === "in-progress" ||
                        route.status === "assigned"
                          ? "text-white/70"
                          : "text-muted-foreground")
                      }
                    >
                      {route.city}
                      {route.updatedAt
                        ? ` · ${new Date(route.updatedAt).toLocaleTimeString()}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0 " +
                      (route.status === "in-progress" ||
                      route.status === "assigned"
                        ? "bg-white/20 text-white"
                        : "bg-white text-foreground")
                    }
                  >
                    {formatStatus(route.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedRoute && showRouteDetails && (
          <div className="rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedRoute.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedRoute.startLocation} → {selectedRoute.endLocation}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-muted text-foreground">
                  {difficultyLabel}
                </Badge>
                <Badge className="bg-muted text-foreground">
                  {formatStatus(selectedRoute.status)}
                </Badge>
                {typeof selectedRoute.coverage === "number" && (
                  <Badge className="bg-muted text-foreground">
                    {selectedRoute.coverage}% coverage
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="font-semibold text-foreground">City:</span>{" "}
                {selectedRoute.city}
              </div>
              {selectedRoute.zone && (
                <div>
                  <span className="font-semibold text-foreground">Zone:</span>{" "}
                  {selectedRoute.zone}
                </div>
              )}
              {selectedRoute.estimatedDuration && (
                <div>
                  <span className="font-semibold text-foreground">ETA:</span>{" "}
                  {selectedRoute.estimatedDuration}
                </div>
              )}
              {selectedRoute.startedAt && (
                <div>
                  <span className="font-semibold text-foreground">
                    Started:
                  </span>{" "}
                  {new Date(selectedRoute.startedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
