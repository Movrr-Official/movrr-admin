"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Target, Clock, MapPin, TrendingUp, Settings } from "lucide-react";
import { shouldUseMockData } from "@/lib/dataSource";
import { useToast } from "@/hooks/useToast";

type OptimizerLocation = { id?: string; lat: number; lng: number };

type CampaignContext = {
  id?: string;
  name?: string;
  campaignType?: string;
  targetAudience?: string;
  impressionGoal?: number;
  startDate?: string;
  endDate?: string;
  vehicleTypeRequired?: string;
  targetZones?: string[];
};

type OptimizationContext = {
  campaign?: CampaignContext;
  campaignId?: string;
  analysis?: {
    objectives: string[];
    constraints: string[];
    preferences: string[];
  };
  existingRoutes?: Array<{
    id: string;
    name: string;
    waypoints?: OptimizerLocation[];
    routeId?: string;
  }>;
  campaignZones?: Array<{ id?: string; name?: string; geojson?: string }>;
  hotZones?: Array<{
    id?: string;
    name?: string;
    bonus_percent?: number;
    starts_at?: string | null;
    ends_at?: string | null;
  }>;
  strategicStops?: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    order: number;
    notes?: string | null;
  }>;
};

type OptimizerPayload = {
  start_index?: number;
  locations?: OptimizerLocation[];
  context?: OptimizationContext;
};

type OptimizationInsights = {
  rationale: string[];
  preferences: string[];
  objectives: string[];
  constraints: string[];
  existingRoutes: {
    count: number;
    existingStopsCount: number;
    suggestedStops: OptimizerLocation[];
    campaignZones: string[];
    hotZones: string[];
    outOfZoneStops: OptimizerLocation[];
  };
  newRoute: {
    stops: OptimizerLocation[];
    addedStops: string[];
    removedStops: string[];
    reorderedStops: number;
    outOfZoneStops: OptimizerLocation[];
  } | null;
};

interface RouteOptimizerProps {
  // onOptimize MAY return an optimizer payload: { start_index?, locations?, context? }
  onOptimize: () => Promise<OptimizerPayload | void>;
  isOptimizing: boolean;
}

export function RouteOptimizer({
  onOptimize,
  isOptimizing,
}: RouteOptimizerProps) {
  const [optimizationSettings, setOptimizationSettings] = useState({
    priority: "impressions",
    maxDuration: [120],
    avoidTraffic: true,
    includeRestStops: true,
    weatherConsideration: true,
    timeOfDay: "peak",
  });

  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [candidateRoute, setCandidateRoute] = useState<any | null>(null);
  const [optimizationSucceeded, setOptimizationSucceeded] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown");
  const [decisionState, setDecisionState] = useState<
    "idle" | "accepted" | "rejected"
  >("idle");
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [optimizationContext, setOptimizationContext] =
    useState<OptimizationContext | null>(null);
  const [optimizationInsights, setOptimizationInsights] =
    useState<OptimizationInsights | null>(null);
  const [hasStoredResults, setHasStoredResults] = useState(false);
  const { toast } = useToast();

  const buildMockPayload = () => {
    const baseLat = 52.3676 + (Math.random() - 0.5) * 0.02;
    const baseLng = 4.9041 + (Math.random() - 0.5) * 0.04;
    const count = Math.min(
      7,
      Math.max(4, Math.round(optimizationSettings.maxDuration[0] / 30)),
    );

    const locations = Array.from({ length: count }, (_, idx) => {
      const jitterLat = (Math.random() - 0.5) * 0.02;
      const jitterLng = (Math.random() - 0.5) * 0.03;
      return {
        id: `M${idx + 1}`,
        lat: Number((baseLat + jitterLat).toFixed(5)),
        lng: Number((baseLng + jitterLng).toFixed(5)),
      };
    });

    return {
      start_index: 0,
      locations,
    };
  };

  const buildEdgePenalties = (locationsCount: number) => {
    if (locationsCount <= 0) return undefined;

    const basePenalty =
      (optimizationSettings.avoidTraffic ? 0.1 : 0) +
      (optimizationSettings.weatherConsideration ? 0.05 : 0);

    const timeMultiplier =
      optimizationSettings.timeOfDay === "peak"
        ? 0.12
        : optimizationSettings.timeOfDay === "evening"
          ? 0.08
          : optimizationSettings.timeOfDay === "midday"
            ? 0.04
            : 0;

    const priorityBias =
      optimizationSettings.priority === "duration" ||
      optimizationSettings.priority === "efficiency"
        ? 0.06
        : optimizationSettings.priority === "coverage"
          ? -0.03
          : 0;

    const penalty = Math.max(0, basePenalty + timeMultiplier + priorityBias);

    return Array.from({ length: locationsCount }, (_, i) =>
      Array.from({ length: locationsCount }, (_, j) => {
        if (i === j) return 1.0;
        const rand = 0.95 + Math.random() * 0.1;
        return Number((1.0 + penalty * rand).toFixed(3));
      }),
    );
  };

  const fetchEdgePenalties = async (locations: any[], preferences: any) => {
    try {
      const res = await fetch("/api/optimize/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations, preferences }),
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      if (!data || !Array.isArray(data.edge_penalties)) return undefined;
      return data.edge_penalties;
    } catch (e) {
      return undefined;
    }
  };

  const checkServiceHealth = async () => {
    try {
      const res = await fetch("/api/optimize/health", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setServiceStatus("available");
        return true;
      }
      setServiceStatus("unavailable");
      return false;
    } catch (e) {
      setServiceStatus("unavailable");
      return false;
    }
  };

  useEffect(() => {
    checkServiceHealth();
    const interval = setInterval(checkServiceHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const suggestStopsFromLocations = (locations: OptimizerLocation[]) => {
    if (!Array.isArray(locations) || locations.length < 3) return [];
    const indices = [
      Math.floor(locations.length / 3),
      Math.floor((locations.length * 2) / 3),
    ].filter(
      (idx, i, arr) =>
        idx > 0 && idx < locations.length - 1 && arr.indexOf(idx) === i,
    );
    return indices
      .map((idx) => locations[idx])
      .filter(
        (stop): stop is OptimizerLocation =>
          !!stop &&
          typeof stop.lat === "number" &&
          typeof stop.lng === "number",
      );
  };

  const pointInPolygon = (
    point: { latitude: number; longitude: number },
    polygon: { latitude: number; longitude: number }[],
  ) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;
      const intersect =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude <
          ((xj - xi) * (point.latitude - yi)) / (yj - yi + Number.EPSILON) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const parseCampaignZones = (zones: Array<{ geojson?: string }>) => {
    const polygons: Array<{
      outer: { latitude: number; longitude: number }[];
      holes: { latitude: number; longitude: number }[][];
    }> = [];

    zones.forEach((zone) => {
      if (!zone?.geojson) return;
      try {
        const parsed = JSON.parse(zone.geojson);
        const geometry = parsed?.type === "Feature" ? parsed.geometry : parsed;
        const coords = geometry?.coordinates;
        const type = geometry?.type;
        if (!coords || !type) return;

        const pushPolygon = (rings: any[]) => {
          if (!Array.isArray(rings) || rings.length === 0) return;
          const outer = (rings[0] || [])
            .map((p: any) => ({
              longitude: Number(p?.[0]),
              latitude: Number(p?.[1]),
            }))
            .filter(
              (p: { longitude: number; latitude: number }) =>
                Number.isFinite(p.longitude) && Number.isFinite(p.latitude),
            );
          if (outer.length < 3) return;
          const holes = (rings.slice(1) || []).map((hole) =>
            (hole || [])
              .map((p: any) => ({
                longitude: Number(p?.[0]),
                latitude: Number(p?.[1]),
              }))
              .filter(
                (p: any) =>
                  Number.isFinite(p.longitude) && Number.isFinite(p.latitude),
              ),
          );
          polygons.push({ outer, holes });
        };

        if (type === "Polygon") {
          pushPolygon(coords);
        }

        if (type === "MultiPolygon") {
          coords.forEach((poly: any[]) => pushPolygon(poly));
        }
      } catch (e) {
        return;
      }
    });

    return polygons;
  };

  const isPointInZones = (
    point: { latitude: number; longitude: number },
    zones: Array<{
      outer: { latitude: number; longitude: number }[];
      holes: { latitude: number; longitude: number }[][];
    }>,
  ) => {
    for (const zone of zones) {
      if (!zone?.outer?.length) continue;
      if (!pointInPolygon(point, zone.outer)) continue;
      if (!zone.holes || zone.holes.length === 0) return true;
      const insideHole = zone.holes.some(
        (hole) => hole.length > 0 && pointInPolygon(point, hole),
      );
      if (!insideHole) return true;
    }
    return false;
  };

  const buildInsights = (
    payload: OptimizerPayload | void,
    optimizedRoute: any,
  ): OptimizationInsights | null => {
    if (!payload) return null;
    const analysis = payload.context?.analysis;
    const campaignZones = (payload.context?.campaignZones || [])
      .map((zone) => zone.name || zone.id || "Unnamed zone")
      .filter(Boolean);
    const hotZones = (payload.context?.hotZones || [])
      .map((zone) => zone.name || zone.id || "Hot zone")
      .filter(Boolean);

    const originalLocations = payload.locations || [];
    const optimizedStops = Array.isArray(optimizedRoute?.route)
      ? optimizedRoute.route
      : [];

    const originalIds = originalLocations.map((loc) => String(loc.id ?? ""));
    const optimizedIds = optimizedStops.map((loc: any) => String(loc.id ?? ""));
    const reorderedStops = originalIds.reduce((count, id, index) => {
      const newIndex = optimizedIds.indexOf(id);
      if (newIndex === -1) return count;
      return newIndex !== index ? count + 1 : count;
    }, 0);

    const addedStops = optimizedStops
      .map((stop: any) => String(stop.id ?? ""))
      .filter((id: string) => id && !originalIds.includes(id));

    const removedStops = originalIds.filter(
      (id) => id && !optimizedIds.includes(id),
    );

    const existingSuggestedStops = suggestStopsFromLocations(originalLocations);

    const zonePolygons = parseCampaignZones(
      payload.context?.campaignZones || [],
    );
    const outOfZoneSuggestedStops = existingSuggestedStops.filter((stop) =>
      zonePolygons.length
        ? !isPointInZones(
            { latitude: stop.lat, longitude: stop.lng },
            zonePolygons,
          )
        : false,
    );
    const outOfZoneNewStops = optimizedStops.filter((stop: any) =>
      zonePolygons.length
        ? !isPointInZones(
            { latitude: Number(stop.lat), longitude: Number(stop.lng) },
            zonePolygons,
          )
        : false,
    );

    const preferences = [
      `Priority: ${optimizationSettings.priority}`,
      `Max duration: ${optimizationSettings.maxDuration[0]} min`,
      optimizationSettings.avoidTraffic ? "Avoid traffic" : "Allow traffic",
      optimizationSettings.includeRestStops
        ? "Include rest stops"
        : "No rest stops",
      optimizationSettings.weatherConsideration
        ? "Weather-aware"
        : "Weather-neutral",
      `Time of day: ${optimizationSettings.timeOfDay}`,
    ];

    const maxDurationWarning = Array.isArray(optimizedRoute?.warnings)
      ? optimizedRoute.warnings.includes("max_duration_exceeded")
      : false;

    const rationale = [
      "Optimized ordering to reduce travel cost based on preferences.",
      campaignZones.length
        ? `Aligned with ${campaignZones.length} campaign zone(s).`
        : "No campaign zones available; used waypoint geography.",
      hotZones.length
        ? `Elevated exposure for ${hotZones.length} hot zone(s).`
        : "No hot zones configured for this campaign.",
      originalLocations.length > 12
        ? "Applied a solver time limit to keep optimization responsive."
        : "No additional preferences were introduced.",
      maxDurationWarning
        ? "Route estimate exceeds the configured max duration."
        : "Max duration constraint respected.",
      addedStops.length
        ? `Added ${addedStops.length} stop(s) to improve coverage.`
        : "No additional stops introduced.",
    ];

    return {
      rationale: rationale.filter(Boolean),
      preferences,
      objectives: analysis?.objectives || [],
      constraints: analysis?.constraints || [],
      existingRoutes: {
        count: payload.context?.existingRoutes?.length ?? 0,
        existingStopsCount: payload.context?.strategicStops?.length ?? 0,
        suggestedStops: existingSuggestedStops,
        campaignZones,
        hotZones,
        outOfZoneStops: outOfZoneSuggestedStops,
      },
      newRoute: optimizedStops.length
        ? {
            stops: optimizedStops,
            addedStops,
            removedStops,
            reorderedStops,
            outOfZoneStops: outOfZoneNewStops,
          }
        : null,
    };
  };

  const storeOptimizationResults = (
    route: any,
    insights: OptimizationInsights | null,
    context: OptimizationContext | null,
  ) => {
    try {
      const payload = {
        generatedAt: new Date().toISOString(),
        route,
        insights,
        context,
      };
      sessionStorage.setItem(
        "routeOptimizationResults",
        JSON.stringify(payload),
      );
      setHasStoredResults(true);
      return true;
    } catch (err) {
      console.warn("failed to store optimization results", err);
      return false;
    }
  };

  const handleOptimize = async () => {
    if (serviceStatus === "unavailable") {
      setOptimizeError(
        "Route optimization service is temporarily unavailable. Please try again later.",
      );
      setServiceUnavailable(true);
      return;
    }
    setOptimizationProgress(0);
    setCandidateRoute(null);
    setDecisionState("idle");
    setOptimizationSucceeded(false);
    setOptimizationInsights(null);

    // Simulate optimization progress
    const interval = setInterval(() => {
      setOptimizationProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    let parentPayload: OptimizerPayload | void;
    try {
      parentPayload = await onOptimize();
    } catch (err) {
      setOptimizeError(String(err));
      console.warn("failed to prepare optimization payload", err);
      return;
    } finally {
      clearInterval(interval);
      setOptimizationProgress(100);
    }

    setOptimizeError(null);
    setServiceUnavailable(false);
    setOptimizationContext(parentPayload?.context ?? null);
    // Call prototype OR-Tools service to retrieve a candidate route for review.
    try {
      // Ask parent for a payload first (the RoutesOverview returns real route waypoints when available)
      // Determine whether to use mock data. Mock only allowed when explicitly enabled and not in production.
      const allowMock = shouldUseMockData();

      let payloadToSend: any = null;
      const preferences: Record<string, any> = {
        max_duration_minutes: optimizationSettings.maxDuration[0],
        avoid_traffic: optimizationSettings.avoidTraffic,
        include_rest_stops: optimizationSettings.includeRestStops,
        weather_consideration: optimizationSettings.weatherConsideration,
        time_of_day: optimizationSettings.timeOfDay,
        priority: optimizationSettings.priority,
      };

      if (
        parentPayload &&
        Array.isArray(parentPayload.locations) &&
        parentPayload.locations.length > 0
      ) {
        const serverPenalties = await fetchEdgePenalties(
          parentPayload.locations,
          preferences,
        );
        if (parentPayload.locations.length > 12) {
          preferences.solver_time_limit_seconds = 5;
        }
        payloadToSend = {
          ...parentPayload,
          preferences: {
            ...preferences,
            edge_penalties:
              serverPenalties ??
              buildEdgePenalties(parentPayload.locations.length),
          },
        };
      } else if (allowMock) {
        const mockPayload = buildMockPayload();
        payloadToSend = {
          ...mockPayload,
          preferences: {
            ...preferences,
            edge_penalties: buildEdgePenalties(mockPayload.locations.length),
          },
        };
      } else {
        setOptimizeError(
          "No route data available for optimization (supply waypoints or enable mock in non-production).",
        );
        return;
      }

      const res = await fetch("/api/optimize/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data || !Array.isArray(data.route)) {
          setOptimizeError("optimizer returned unexpected payload");
          console.warn("unexpected optimize payload", data);
        } else {
          setCandidateRoute(data);
          setOptimizationSucceeded(true);
          const insights = buildInsights(parentPayload, data);
          setOptimizationInsights(insights);
          storeOptimizationResults(
            data,
            insights,
            parentPayload?.context ?? null,
          );
        }
      } else {
        const text = await res.text().catch(() => "");
        // Treat server errors as temporary service unavailability in production
        if (res.status >= 500) {
          setServiceUnavailable(true);
          setServiceStatus("unavailable");
          setOptimizeError(
            "Route optimization service is temporarily unavailable. Please try again later.",
          );
        } else if (res.status === 429) {
          setOptimizeError(
            "Route optimization is rate-limited. Please wait a moment and retry.",
          );
        } else {
          setOptimizeError(`optimizer responded ${res.status}: ${text}`);
        }
        console.warn("optimize service returned", res.status, text);
      }
    } catch (err) {
      // Network or abort errors
      const msg =
        err && (err as any).name === "AbortError"
          ? "Request timed out"
          : String(err);
      setOptimizeError(msg);
      // In production, mark upstream failures as service unavailable
      if (process.env.NODE_ENV === "production") {
        setServiceUnavailable(true);
        setServiceStatus("unavailable");
        setOptimizeError(
          "Route optimization service is temporarily unavailable. Please try again later.",
        );
      }
      console.warn("failed to call optimize service", err);
    }
  };

  const retryOptimize = async () => {
    setOptimizeError(null);
    setServiceUnavailable(false);
    await handleOptimize();
  };

  return (
    <Card className="glass-card border-0 w-full max-w-[500px]">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold">Route Optimizer</CardTitle>
        <CardDescription>
          AI-powered route optimization for maximum impact
        </CardDescription>
        {serviceStatus === "unavailable" && (
          <Badge variant="destructive" className="mt-2 w-fit">
            Optimizer unavailable
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Optimization Priority */}
        <div className="space-y-2">
          <Label>Optimization Priority</Label>
          <Select
            value={optimizationSettings.priority}
            onValueChange={(value) =>
              setOptimizationSettings((prev) => ({ ...prev, priority: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="impressions">
                <div className="flex items-center">
                  <Target className="mr-2 h-4 w-4" />
                  Max Impressions
                </div>
              </SelectItem>
              <SelectItem value="efficiency">
                <div className="flex items-center">
                  <Zap className="mr-2 h-4 w-4" />
                  Route Efficiency
                </div>
              </SelectItem>
              <SelectItem value="duration">
                <div className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  Shortest Time
                </div>
              </SelectItem>
              <SelectItem value="coverage">
                <div className="flex items-center">
                  <MapPin className="mr-2 h-4 w-4" />
                  Max Coverage
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Max Duration */}
        <div className="space-y-2">
          <Label>
            Maximum Duration: {optimizationSettings.maxDuration[0]} minutes
          </Label>
          <Slider
            value={optimizationSettings.maxDuration}
            onValueChange={(value) =>
              setOptimizationSettings((prev) => ({
                ...prev,
                maxDuration: value,
              }))
            }
            max={240}
            min={30}
            step={15}
            className="w-full"
          />
        </div>

        {/* Time of Day */}
        <div className="space-y-2">
          <Label>Time of Day</Label>
          <Select
            value={optimizationSettings.timeOfDay}
            onValueChange={(value) =>
              setOptimizationSettings((prev) => ({ ...prev, timeOfDay: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="peak">Peak Hours (7-9 AM, 5-7 PM)</SelectItem>
              <SelectItem value="midday">Midday (10 AM - 4 PM)</SelectItem>
              <SelectItem value="evening">Evening (7-10 PM)</SelectItem>
              <SelectItem value="weekend">Weekend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Optimization Options */}
        <div className="space-y-4">
          <Label>Optimization Options</Label>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Avoid Heavy Traffic</Label>
              <p className="text-xs text-muted-foreground">
                Route around congested areas
              </p>
            </div>
            <Switch
              checked={optimizationSettings.avoidTraffic}
              onCheckedChange={(checked) =>
                setOptimizationSettings((prev) => ({
                  ...prev,
                  avoidTraffic: checked,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Include Rest Stops</Label>
              <p className="text-xs text-muted-foreground">
                Add strategic break points
              </p>
            </div>
            <Switch
              checked={optimizationSettings.includeRestStops}
              onCheckedChange={(checked) =>
                setOptimizationSettings((prev) => ({
                  ...prev,
                  includeRestStops: checked,
                }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm">Weather Consideration</Label>
              <p className="text-xs text-muted-foreground">
                Adjust for weather conditions
              </p>
            </div>
            <Switch
              checked={optimizationSettings.weatherConsideration}
              onCheckedChange={(checked) =>
                setOptimizationSettings((prev) => ({
                  ...prev,
                  weatherConsideration: checked,
                }))
              }
            />
          </div>
        </div>

        {/* Optimization Progress */}
        {isOptimizing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <Label className="text-sm">Optimizing Route...</Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(optimizationProgress)}%
              </span>
            </div>
            <Progress value={optimizationProgress} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {optimizationProgress < 30 && "Analyzing traffic patterns..."}
              {optimizationProgress >= 30 &&
                optimizationProgress < 60 &&
                "Calculating optimal waypoints..."}
              {optimizationProgress >= 60 &&
                optimizationProgress < 90 &&
                "Estimating impression potential..."}
              {optimizationProgress >= 90 && "Finalizing route optimization..."}
            </p>
          </motion.div>
        )}

        {/* Optimize Button */}
        <Button
          onClick={handleOptimize}
          disabled={isOptimizing || serviceStatus === "unavailable"}
          className="w-full"
        >
          {isOptimizing ? (
            <>
              <Settings className="mr-2 h-4 w-4 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-4 w-4" />
              Optimize Route
            </>
          )}
        </Button>

        {/* Optimization Results Preview */}
        {optimizationProgress === 100 && !isOptimizing && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg border ${
              optimizationSucceeded
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            }`}
          >
            <div className="flex items-center mb-2">
              <TrendingUp
                className={`h-4 w-4 mr-2 ${
                  optimizationSucceeded ? "text-green-600" : "text-amber-600"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  optimizationSucceeded
                    ? "text-green-800 dark:text-green-200"
                    : "text-amber-800 dark:text-amber-200"
                }`}
              >
                {optimizationSucceeded
                  ? "Optimization Complete"
                  : "Optimization Unavailable"}
              </span>
            </div>

            {optimizationSucceeded && (
              <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                <p>
                  • Estimated impressions:{" "}
                  {candidateRoute?.score?.impressions_estimate ?? "—"}
                </p>
                <p>
                  • Approx distance:{" "}
                  {typeof candidateRoute?.metrics?.approx_distance_units ===
                  "number"
                    ? candidateRoute.metrics.approx_distance_units.toFixed(2)
                    : "—"}
                </p>
                <p>
                  • Stops optimized:{" "}
                  {candidateRoute?.metrics?.locations_count ?? "—"}
                </p>
                <p>• Model version: {candidateRoute?.model_version ?? "—"}</p>
                <p>• Trace ID: {candidateRoute?.trace_id ?? "—"}</p>
                {Array.isArray(candidateRoute?.warnings) &&
                  candidateRoute.warnings.includes("max_duration_exceeded") && (
                    <p>
                      • Duration warning: Estimated distance exceeds the max
                      duration setting.
                    </p>
                  )}
              </div>
            )}

            {optimizationSucceeded && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                <div className="rounded border bg-white/70 dark:bg-slate-800/70 px-3 py-2">
                  Routes evaluated:{" "}
                  {optimizationInsights?.existingRoutes.count ?? "—"}
                </div>
                <div className="rounded border bg-white/70 dark:bg-slate-800/70 px-3 py-2">
                  Total changes:{" "}
                  {optimizationInsights?.newRoute
                    ? optimizationInsights.newRoute.addedStops.length +
                      optimizationInsights.newRoute.removedStops.length +
                      optimizationInsights.newRoute.reorderedStops
                    : "—"}
                </div>
                <div className="rounded border bg-white/70 dark:bg-slate-800/70 px-3 py-2">
                  Zones missing:{" "}
                  {optimizationInsights
                    ? optimizationInsights.existingRoutes.campaignZones
                        .length === 0 ||
                      optimizationInsights.existingRoutes.hotZones.length === 0
                      ? "Yes"
                      : "No"
                    : "—"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (candidateRoute) {
                      storeOptimizationResults(
                        candidateRoute,
                        optimizationInsights,
                        optimizationContext,
                      );
                    }
                    window.location.href = "/routes/optimization-results";
                  }}
                  disabled={
                    !candidateRoute ||
                    (!hasStoredResults && !optimizationInsights)
                  }
                >
                  View full results
                </Button>
              </div>
            )}

            {/* Admin review: show candidate if available */}
            {optimizationSucceeded && candidateRoute && (
              <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded border">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">
                    Proposed Route (prototype)
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Service-provided
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  Optimized route ready for review. Open full results to see
                  step-by-step changes and rationale.
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      setDecisionState("accepted");
                      try {
                        const res = await fetch("/api/optimize/decision", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "accept",
                            route: candidateRoute,
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json().catch(() => ({}));
                          toast({
                            title: "Decision recorded",
                            description: `Accepted route${data?.trace_id ? ` (trace ${data.trace_id})` : ""}.`,
                          });
                        } else {
                          toast({
                            title: "Decision failed",
                            description: "Unable to record accept decision.",
                            variant: "destructive",
                          });
                        }
                      } catch (e) {
                        console.warn(e);
                        toast({
                          title: "Decision failed",
                          description:
                            "Network error while recording accept decision.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setDecisionState("rejected");
                      try {
                        const res = await fetch("/api/optimize/decision", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "reject",
                            route: candidateRoute,
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json().catch(() => ({}));
                          toast({
                            title: "Decision recorded",
                            description: `Rejected route${data?.trace_id ? ` (trace ${data.trace_id})` : ""}.`,
                          });
                        } else {
                          toast({
                            title: "Decision failed",
                            description: "Unable to record reject decision.",
                            variant: "destructive",
                          });
                        }
                      } catch (e) {
                        console.warn(e);
                        toast({
                          title: "Decision failed",
                          description:
                            "Network error while recording reject decision.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Reject
                  </Button>

                  {decisionState !== "idle" && (
                    <div className="text-sm ml-2">
                      {decisionState === "accepted" ? "Accepted" : "Rejected"}
                    </div>
                  )}
                  <div className="ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setAuditLoading(true);
                        setAuditResult(null);
                        try {
                          const res = await fetch(
                            `/api/optimize/audit?limit=20`,
                          );
                          if (res.ok) {
                            const data = await res.json();
                            setAuditResult(data);
                          } else {
                            console.warn("audit fetch failed", res.status);
                          }
                        } catch (e) {
                          console.warn(e);
                        }
                        setAuditLoading(false);
                      }}
                    >
                      {auditLoading ? "Checking…" : "Check Token Audit"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {optimizeError && (
              <div className="mt-3">
                <div className="text-sm text-red-700 dark:text-red-300">
                  {serviceUnavailable ? (
                    <>
                      Route optimization service is temporarily unavailable.
                      Please try again later or contact your administrator.
                    </>
                  ) : (
                    <>Error: {optimizeError}</>
                  )}
                </div>
                {serviceUnavailable && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button onClick={retryOptimize} size="sm">
                      Retry
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        // open support/help modal or copy an instruction — keep minimal here
                        navigator.clipboard?.writeText(
                          "Please contact ops@movrr.example with logs and trace_id",
                        );
                      }}
                    >
                      Copy Support Note
                    </Button>
                  </div>
                )}
              </div>
            )}
            {/* Audit results */}
            {auditResult && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900 rounded border">
                <div className="text-sm font-medium mb-2">
                  Previous-token audit
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  Count: {auditResult.count}
                </div>
                <div className="text-xs max-h-40 overflow-auto space-y-2">
                  {auditResult.entries.map((e: any, i: number) => (
                    <div
                      key={i}
                      className="p-2 bg-white dark:bg-slate-800 rounded border"
                    >
                      <pre className="whitespace-pre-wrap text-xs">
                        {JSON.stringify(e, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
