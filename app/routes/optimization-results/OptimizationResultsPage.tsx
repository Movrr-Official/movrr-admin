"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type OptimizerLocation = { id?: string; lat: number; lng: number };

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

type OptimizationResults = {
  generatedAt?: string;
  route?: any;
  insights?: OptimizationInsights | null;
  context?: {
    campaign?: { name?: string };
  } | null;
};

export default function OptimizationResultsPage() {
  const [results, setResults] = useState<OptimizationResults | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("routeOptimizationResults");
      if (!stored) return;
      const parsed = JSON.parse(stored) as OptimizationResults;
      setResults(parsed);
    } catch (err) {
      console.warn("Failed to parse optimization results", err);
    }
  }, []);

  if (!results) {
    return (
      <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
        <Card className="glass-card border-0 max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Route Optimization Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base text-muted-foreground">
              No optimization results are available yet. Run the optimizer to
              generate a new report.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/routes";
              }}
            >
              Back to Routes
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const insights = results.insights;
  const route = results.route;
  const warnings: string[] = Array.isArray(route?.warnings)
    ? route.warnings
    : [];

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card className="glass-card border-0">
          <CardHeader className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-2xl font-bold">
                Route Optimization Results
                {results.context?.campaign?.name
                  ? ` — ${results.context.campaign.name}`
                  : ""}
              </CardTitle>
              {warnings.includes("max_duration_exceeded") && (
                <Badge variant="destructive" className="text-sm">
                  Duration exceeded
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Generated at: {results.generatedAt ?? "—"}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border bg-white/70 dark:bg-slate-800/70 p-3">
              <div className="text-sm text-muted-foreground">Impressions</div>
              <div className="text-2xl font-semibold">
                {route?.score?.impressions_estimate ?? "—"}
              </div>
            </div>
            <div className="rounded border bg-white/70 dark:bg-slate-800/70 p-3">
              <div className="text-sm text-muted-foreground">Distance</div>
              <div className="text-2xl font-semibold">
                {typeof route?.metrics?.approx_distance_units === "number"
                  ? route.metrics.approx_distance_units.toFixed(2)
                  : "—"}
              </div>
            </div>
            <div className="rounded border bg-white/70 dark:bg-slate-800/70 p-3">
              <div className="text-sm text-muted-foreground">Stops</div>
              <div className="text-2xl font-semibold">
                {route?.metrics?.locations_count ?? "—"}
              </div>
            </div>
            <div className="rounded border bg-white/70 dark:bg-slate-800/70 p-3">
              <div className="text-sm text-muted-foreground">Trace ID</div>
              <div className="text-base font-medium break-all">
                {route?.trace_id ?? "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Optimization Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-base">
              <div>
                <div className="font-medium">Objectives</div>
                <ul className="list-disc list-inside text-muted-foreground">
                  {(insights?.objectives ?? []).length
                    ? insights?.objectives.map((item, idx) => (
                        <li key={`obj-${idx}`}>{item}</li>
                      ))
                    : "No objectives recorded."}
                </ul>
              </div>
              <div>
                <div className="font-medium">Constraints</div>
                <ul className="list-disc list-inside text-muted-foreground">
                  {(insights?.constraints ?? []).length
                    ? insights?.constraints.map((item, idx) => (
                        <li key={`con-${idx}`}>{item}</li>
                      ))
                    : "No constraints recorded."}
                </ul>
              </div>
              <div>
                <div className="font-medium">Preferences</div>
                <ul className="list-disc list-inside text-muted-foreground">
                  {(insights?.preferences ?? []).length
                    ? insights?.preferences.map((item, idx) => (
                        <li key={`pref-${idx}`}>{item}</li>
                      ))
                    : "No preferences recorded."}
                </ul>
              </div>
              <div>
                <div className="font-medium">Rationale</div>
                <ul className="list-disc list-inside text-muted-foreground">
                  {(insights?.rationale ?? []).length
                    ? insights?.rationale.map((item, idx) => (
                        <li key={`rat-${idx}`}>{item}</li>
                      ))
                    : "No rationale recorded."}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Route Changes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-base">
              <div>
                <div className="font-medium">Existing routes</div>
                <div className="text-muted-foreground">
                  {insights?.existingRoutes.count ?? "—"} routes evaluated,{" "}
                  {insights?.existingRoutes.existingStopsCount ?? "—"} strategic
                  stops.
                </div>
                {insights?.existingRoutes.outOfZoneStops?.length ? (
                  <div className="text-amber-700 dark:text-amber-300">
                    {insights.existingRoutes.outOfZoneStops.length} stop(s) fall
                    outside campaign zones.
                  </div>
                ) : null}
              </div>
              <div>
                <div className="font-medium">New route proposal</div>
                {insights?.newRoute ? (
                  <div className="text-muted-foreground">
                    Added {insights.newRoute.addedStops.length}, removed{" "}
                    {insights.newRoute.removedStops.length}, reordered{" "}
                    {insights.newRoute.reorderedStops}.
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    No new route proposal available.
                  </div>
                )}
                {insights?.newRoute?.outOfZoneStops?.length ? (
                  <div className="text-amber-700 dark:text-amber-300">
                    {insights.newRoute.outOfZoneStops.length} stop(s) fall
                    outside campaign zones.
                  </div>
                ) : null}
              </div>
              <div>
                <div className="font-medium">Suggested stops</div>
                <div className="text-muted-foreground">
                  {insights?.existingRoutes.suggestedStops.length
                    ? insights.existingRoutes.suggestedStops
                        .map((stop) => stop.id ?? "Stop")
                        .join(", ")
                    : "No additional stops suggested."}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Proposed Route Stops
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(route?.route) && route.route.length ? (
              <ol className="list-decimal list-inside space-y-1 text-base">
                {route.route.map((stop: any, idx: number) => (
                  <li key={`route-stop-${idx}`}>
                    <strong>{stop.id ?? `Stop ${idx + 1}`}</strong> —{" "}
                    {Number(stop.lat).toFixed(4)}, {Number(stop.lng).toFixed(4)}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-base text-muted-foreground">
                No route stops available.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/routes";
            }}
          >
            Back to Routes
          </Button>
        </div>
      </div>
    </div>
  );
}
