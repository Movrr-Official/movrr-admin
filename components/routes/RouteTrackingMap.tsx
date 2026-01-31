"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef } from "react";
import MapGL, { Layer, MapRef, Marker, Source } from "react-map-gl/maplibre";
import type { LayerProps } from "react-map-gl/maplibre";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavigationControl } from "react-map-gl/maplibre";

const DEFAULT_CENTER = { latitude: 52.0705, longitude: 4.3007 };

const toPoint = (point: any) => {
  const lat =
    point?.lat ??
    point?.latitude ??
    point?.coords?.latitude ??
    point?.location?.lat;
  const lng =
    point?.lng ??
    point?.longitude ??
    point?.coords?.longitude ??
    point?.location?.lng;

  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
};

export function RouteTrackingMap({ points }: { points: any[] }) {
  const mapRef = useRef<MapRef | null>(null);

  const coordinates = useMemo(() => {
    return (points ?? []).map(toPoint).filter(Boolean) as Array<{
      lat: number;
      lng: number;
    }>;
  }, [points]);

  const geoJson = useMemo(() => {
    if (coordinates.length === 0) return null;
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: coordinates.map((point) => [point.lng, point.lat]),
      },
      properties: {},
    } as const;
  }, [coordinates]);

  const bounds = useMemo(() => {
    if (coordinates.length === 0) return null;
    const lats = coordinates.map((point) => point.lat);
    const lngs = coordinates.map((point) => point.lng);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [coordinates]);

  useEffect(() => {
    if (!mapRef.current || !bounds) return;
    mapRef.current.fitBounds(bounds, { padding: 40, duration: 800 });
  }, [bounds]);

  const lineLayer: LayerProps = {
    id: "route-path",
    type: "line",
    paint: {
      "line-color": "#22c55e",
      "line-width": 4,
    },
  };

  const mapStyle =
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
    "https://tiles.openfreemap.org/styles/liberty";

  if (!geoJson) {
    return (
      <Card className="border border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No GPS points available yet.
        </CardContent>
      </Card>
    );
  }

  const startPoint = coordinates[0];
  const endPoint = coordinates[coordinates.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">GPS Trace</Badge>
        <span>{coordinates.length} points</span>
      </div>
      <div className="h-64 overflow-hidden rounded-lg border">
        <MapGL
          ref={mapRef}
          initialViewState={DEFAULT_CENTER}
          mapStyle={mapStyle}
          scrollZoom
          attributionControl={false}
        >
          <NavigationControl position="bottom-right" />
          <Source id="route-line" type="geojson" data={geoJson}>
            <Layer {...lineLayer} />
          </Source>
          {startPoint && (
            <Marker latitude={startPoint.lat} longitude={startPoint.lng}>
              <div className="h-3 w-3 rounded-full bg-emerald-500 shadow" />
            </Marker>
          )}
          {endPoint && (
            <Marker latitude={endPoint.lat} longitude={endPoint.lng}>
              <div className="h-3 w-3 rounded-full bg-red-500 shadow" />
            </Marker>
          )}
        </MapGL>
      </div>
    </div>
  );
}
