"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getContractHealthReport } from "@/app/actions/contractHealth";
import type { ContractHealthReport } from "@/lib/contractDiagnostics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STALE_MS = 1000 * 60 * 5;

function scoreVariant(score: number): "success" | "warning" | "destructive" {
  if (score >= 90) return "success";
  if (score >= 70) return "warning";
  return "destructive";
}

function ScoreIcon({ score }: { score: number }) {
  if (score >= 90) return <ShieldCheck className="h-5 w-5 text-success" />;
  if (score >= 70) return <ShieldAlert className="h-5 w-5 text-warning" />;
  return <ShieldX className="h-5 w-5 text-destructive" />;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical")
    return <ShieldX className="h-3.5 w-3.5 text-destructive flex-shrink-0" />;
  if (severity === "warning")
    return <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
}

export function ContractHealthPanel() {
  const [expanded, setExpanded] = React.useState(false);

  const {
    data: result,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["contractHealth"],
    queryFn: () => getContractHealthReport(7),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });

  const report: ContractHealthReport | null = result?.success
    ? result.data
    : null;

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  const hasSampleViolations = (report?.sampleViolations.length ?? 0) > 0;

  return (
    <Card className="glass-card border-0 animate-slide-up">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {report ? (
              <ScoreIcon score={report.healthScore} />
            ) : (
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            )}
            <CardTitle className="text-base font-bold">
              Mobile ↔ Admin Contract Health
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
        {lastChecked && (
          <p className="text-xs text-muted-foreground">
            Last checked: {lastChecked} · Window: 7 days ·{" "}
            {report?.totalTransactions ?? 0} transactions
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Analysing recent transactions…
          </div>
        )}

        {!isLoading && result && !result.success && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <ShieldX className="h-4 w-4" />
            {result.error}
          </div>
        )}

        {report && (
          <>
            {/* Health score + summary badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {report.healthScore}%
                </span>
                <Badge
                  variant={scoreVariant(report.healthScore)}
                  className="text-xs"
                >
                  {report.healthScore >= 90
                    ? "Healthy"
                    : report.healthScore >= 70
                      ? "Degraded"
                      : "Critical"}
                </Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                {report.criticalCount > 0 && (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <ShieldX className="h-3 w-3" />
                    {report.criticalCount} critical
                  </Badge>
                )}
                {report.warningCount > 0 && (
                  <Badge variant="warning" className="text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {report.warningCount} warnings
                  </Badge>
                )}
                {report.criticalCount === 0 && report.warningCount === 0 && (
                  <Badge variant="success" className="text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    No violations
                  </Badge>
                )}
              </div>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCell
                label="Missing session link"
                value={report.missingRideSessionId}
                total={report.totalTransactions}
                critical={report.missingRideSessionId > 0}
              />
              <MetricCell
                label="Missing verified mins"
                value={report.missingVerifiedMinutes}
                total={report.totalTransactions}
              />
              <MetricCell
                label="Missing base points"
                value={report.missingBasePoints}
                total={report.totalTransactions}
              />
              <MetricCell
                label="Unknown bonus types"
                value={report.unrecognizedBonusTypes.length}
                total={undefined}
              />
            </div>

            {/* Unrecognized types */}
            {report.unrecognizedBonusTypes.length > 0 && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-1">
                <p className="text-xs font-semibold text-warning">
                  Unrecognized bonus types detected
                </p>
                <p className="text-xs text-muted-foreground">
                  These types are written by mobile but have no label in{" "}
                  <code className="text-xs">BONUS_TYPE_LABELS</code>. Add them
                  to <code className="text-xs">lib/rewardConstants.ts</code>.
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {report.unrecognizedBonusTypes.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-xs font-mono"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {report.unrecognizedSources.length > 0 && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-1">
                <p className="text-xs font-semibold text-warning">
                  Unrecognized transaction sources
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {report.unrecognizedSources.map((s) => (
                    <Badge
                      key={s}
                      variant="outline"
                      className="text-xs font-mono"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sample violations — collapsible */}
            {hasSampleViolations && (
              <div>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {expanded ? "Hide" : "Show"} sample violations (
                  {report.sampleViolations.length})
                </button>

                {expanded && (
                  <div className="mt-2 space-y-2">
                    {report.sampleViolations.map(
                      ({ transactionId, violations }) => (
                        <div
                          key={transactionId}
                          className="rounded-lg bg-muted/30 p-3 space-y-1"
                        >
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            tx: {transactionId}
                          </p>
                          {violations.map((v, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <SeverityIcon severity={v.severity} />
                              <p className="text-xs text-foreground/80 leading-tight">
                                {v.message}
                              </p>
                            </div>
                          ))}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCell({
  label,
  value,
  total,
  critical = false,
}: {
  label: string;
  value: number;
  total: number | undefined;
  critical?: boolean;
}) {
  const pct =
    total != null && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground leading-tight mb-1">
        {label}
      </p>
      <p
        className={`text-lg font-bold ${critical && value > 0 ? "text-destructive" : value > 0 ? "text-warning" : "text-success"}`}
      >
        {value}
      </p>
      {pct != null && (
        <p className="text-xs text-muted-foreground">{pct}% of total</p>
      )}
    </div>
  );
}
