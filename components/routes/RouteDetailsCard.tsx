"use client";

import { useMemo } from "react";
import { Ruler, Clock, Eye, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiderRoute } from "@/schemas";

interface RouteDetailsCardProps {
  route?: RiderRoute | null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const radius = 6371; // km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function calculateRouteDistance(route: RiderRoute) {
  if (!route.waypoints || route.waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < route.waypoints.length; i += 1) {
    const prev = route.waypoints[i - 1];
    const next = route.waypoints[i];
    total += haversineDistance(prev.lat, prev.lng, next.lat, next.lng);
  }
  return total;
}

function estimateImpressions(route: RiderRoute, distanceKm: number) {
  if (route.coverage && route.coverage > 0) {
    return Math.round(route.coverage * 120);
  }
  if (distanceKm > 0) {
    return Math.round(distanceKm * 450);
  }
  return 0;
}

export function RouteDetailsCard({ route }: RouteDetailsCardProps) {
  const distanceKm = useMemo(() => {
    if (!route) return 0;
    return calculateRouteDistance(route);
  }, [route]);

  const impressions = useMemo(() => {
    if (!route) return 0;
    return estimateImpressions(route, distanceKm);
  }, [route, distanceKm]);

  const distanceLabel = route ? `${distanceKm.toFixed(1)} km` : "Not available";
  const durationLabel = route?.estimatedDuration ?? "Not available";
  const impressionsLabel = route
    ? impressions.toLocaleString()
    : "Not available";
  const difficultyLabel = route?.difficulty ?? "—";

  return (
    <Card className="glass-card border-0 w-full max-w-[500px]">
      <CardHeader>
        <CardTitle className="text-lg font-bold">
          Current Route Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Route</p>
            <p className="text-sm font-semibold">
              {route?.name ?? "No active route"}
            </p>
          </div>
          {route?.difficulty && (
            <Badge className="capitalize" variant="secondary">
              {difficultyLabel}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Ruler className="h-4 w-4" />
              Distance
            </div>
            <p className="mt-2 text-sm font-semibold">{distanceLabel}</p>
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" />
              Est. Duration
            </div>
            <p className="mt-2 text-sm font-semibold">{durationLabel}</p>
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Eye className="h-4 w-4" />
              Est. Impressions
            </div>
            <p className="mt-2 text-sm font-semibold">{impressionsLabel}</p>
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4" />
              Difficulty
            </div>
            <p className="mt-2 text-sm font-semibold">{difficultyLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
