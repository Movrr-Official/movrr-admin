"use client";

import Link from "next/link";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsErrorState } from "@/components/ops/OpsEmptyState";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { useSettingsData } from "@/hooks/useSettingsData";
import {
  billingConnectionLabel,
  type BillingConnectionState,
} from "@/features/platform/vocabulary";

const connectionBadgeVariant = (state: BillingConnectionState) => {
  switch (state) {
    case "connected":
      return "success" as const;
    case "handoff":
      return "info" as const;
    case "degraded":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
};

export default function OpsBillingOverview() {
  const { data: settings, isLoading, isError, error, refetch, isFetching } =
    useSettingsData();

  const billing = settings?.values.billing;
  const runtime = settings?.runtime.billing;

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="Billing Operations"
          description="Connection state, plan posture, and finance handoff links."
          actions={[
            {
              label: isFetching ? "Refreshing…" : "Refresh",
              icon: <RefreshCw className="h-4 w-4" />,
              onClick: () => void refetch(),
              variant: "outline",
            },
            {
              label: "Settings",
              href: "/settings?section=billing",
              variant: "outline",
            },
          ]}
        />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading billing settings…</p>
        ) : isError ? (
          <OpsErrorState
            message={error?.message ?? "Failed to load billing settings"}
            onRetry={() => void refetch()}
          />
        ) : billing ? (
          <>
            <OpsKpiGrid
              items={[
                {
                  id: "connection",
                  label: "Connection",
                  value: billingConnectionLabel(billing.connectionStatus),
                  tone:
                    billing.connectionStatus === "connected"
                      ? "success"
                      : billing.connectionStatus === "degraded"
                        ? "warning"
                        : "muted",
                },
                {
                  id: "plan",
                  label: "Plan",
                  value: billing.planName,
                },
                {
                  id: "status",
                  label: "Plan status",
                  value: billing.planStatus,
                },
                {
                  id: "entitlements",
                  label: "Entitlements",
                  value: billing.entitlements.length,
                },
              ]}
            />

            {!runtime?.available ? (
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertTitle>Billing provider handoff</AlertTitle>
                <AlertDescription>{runtime?.message}</AlertDescription>
              </Alert>
            ) : null}

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  Billing connection
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="text-sm font-medium text-foreground">
                    Connection status
                  </div>
                  <div className="mt-2">
                    <Badge variant={connectionBadgeVariant(billing.connectionStatus)}>
                      {billingConnectionLabel(billing.connectionStatus)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Unified vocabulary: not_connected, handoff, connected, degraded.
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm">
                  <div className="font-medium text-foreground">Invoice contact</div>
                  <div className="mt-1 text-muted-foreground">
                    {billing.invoiceContactEmail || "Not configured"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm md:col-span-2">
                  <div className="font-medium text-foreground">Usage summary</div>
                  <div className="mt-1 text-muted-foreground">
                    {billing.usageSummary}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm md:col-span-2">
                  <div className="font-medium text-foreground">Entitlements</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {billing.entitlements.length ? (
                      billing.entitlements.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">
                        No billing entitlements are currently connected.
                      </span>
                    )}
                  </div>
                </div>
                {billing.billingPortalUrl ? (
                  <div className="md:col-span-2">
                    <Button asChild variant="outline">
                      <Link href={billing.billingPortalUrl} target="_blank">
                        Open billing portal
                        <ExternalLink className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
