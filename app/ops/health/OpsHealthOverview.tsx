"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";

type PlatformHealthResponse = {
  status: "operational" | "degraded" | "down";
  checks: Array<{ name: string; status: "ok" | "error"; message?: string }>;
  timestamp: string;
};

const statusTone = (status: string) => {
  if (status === "operational" || status === "ok") return "success" as const;
  if (status === "degraded") return "warning" as const;
  return "destructive" as const;
};

export default function OpsHealthOverview() {
  const {
    data: platformHealth,
    isLoading: platformLoading,
    isError: platformError,
    error: platformErr,
    refetch: refetchPlatform,
    isFetching: platformFetching,
  } = useQuery({
    queryKey: ["opsHealth", "platform"],
    queryFn: async () => {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Platform health returned ${response.status}`);
      }
      return (await response.json()) as PlatformHealthResponse;
    },
    staleTime: 30_000,
  });

  const {
    data: optimizerHealth,
    isLoading: optimizerLoading,
    isError: optimizerError,
    error: optimizerErr,
    refetch: refetchOptimizer,
    isFetching: optimizerFetching,
  } = useQuery({
    queryKey: ["opsHealth", "optimizer"],
    queryFn: async () => {
      const response = await fetch("/api/optimize/health", { cache: "no-store" });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          body: parsed,
        };
      }
      return {
        ok: true,
        status: response.status,
        body: parsed,
      };
    },
    staleTime: 30_000,
    retry: false,
  });

  const isLoading = platformLoading || optimizerLoading;
  const isFetching = platformFetching || optimizerFetching;

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="System Health"
          description="Live diagnostics for platform services and the route optimizer."
          actions={[
            {
              label: isFetching ? "Refreshing…" : "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => {
                void refetchPlatform();
                void refetchOptimizer();
              },
              variant: "outline",
            },
          ]}
        />

        <OpsKpiGrid
          isLoading={isLoading}
          items={[
            {
              id: "platform",
              label: "Platform",
              value: platformHealth?.status ?? "—",
              tone:
                platformHealth?.status === "operational"
                  ? "success"
                  : platformHealth?.status === "degraded"
                    ? "warning"
                    : "danger",
            },
            {
              id: "checks",
              label: "Platform checks",
              value: platformHealth?.checks.length ?? 0,
            },
            {
              id: "optimizer",
              label: "Route optimizer",
              value: optimizerHealth?.ok ? "Connected" : "Degraded",
              tone: optimizerHealth?.ok ? "success" : "warning",
            },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-4 w-4" />
                Platform health (`/api/health`)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {platformLoading ? (
                <p className="text-sm text-muted-foreground">Checking platform…</p>
              ) : platformError ? (
                <OpsErrorState
                  message={
                    platformErr instanceof Error
                      ? platformErr.message
                      : "Platform health check failed"
                  }
                  onRetry={() => void refetchPlatform()}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Aggregate</span>
                    <Badge variant={statusTone(platformHealth?.status ?? "down")}>
                      {platformHealth?.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {(platformHealth?.checks ?? []).map((check) => (
                      <div
                        key={check.name}
                        className="flex items-start justify-between rounded-lg border border-border/60 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{check.name}</p>
                          {check.message ? (
                            <p className="text-xs text-muted-foreground">
                              {check.message}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant={statusTone(check.status)}>
                          {check.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {platformHealth?.timestamp ? (
                    <p className="text-xs text-muted-foreground">
                      Checked{" "}
                      {new Date(platformHealth.timestamp).toLocaleString("nl-NL")}
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">
                Route optimizer (`/api/optimize/health`)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {optimizerLoading ? (
                <p className="text-sm text-muted-foreground">
                  Checking route optimizer…
                </p>
              ) : optimizerError ? (
                <OpsErrorState
                  message={
                    optimizerErr instanceof Error
                      ? optimizerErr.message
                      : "Optimizer health check failed"
                  }
                  onRetry={() => void refetchOptimizer()}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      variant={optimizerHealth?.ok ? "success" : "warning"}
                    >
                      {optimizerHealth?.ok ? "connected" : "degraded"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      HTTP {optimizerHealth?.status}
                    </span>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
                    {JSON.stringify(optimizerHealth?.body, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
