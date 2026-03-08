"use client";

import { CheckCircle2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IntegrationStatusCard } from "@/schemas/settings";

type Props = {
  integrations: IntegrationStatusCard[];
  isRefreshing: boolean;
  onRefresh: () => void;
};

const STATUS_ICON = {
  ok: CheckCircle2,
  degraded: TriangleAlert,
  error: XCircle,
  unknown: TriangleAlert,
} as const;

export function IntegrationStatusCards({
  integrations,
  isRefreshing,
  onRefresh,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Runtime health is derived live from configured integrations and environment state.
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Rechecking..." : "Recheck Integrations"}
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {integrations.map((integration) => {
          const Icon = STATUS_ICON[integration.status];
          return (
            <Card key={integration.id} className="glass-card border-0">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{integration.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                  <Badge variant={integration.configured ? "default" : "secondary"}>
                    {integration.configured ? "Configured" : "Not Configured"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4" />
                  <span className="capitalize">{integration.status}</span>
                  <span className="text-muted-foreground">
                    Checked {new Date(integration.lastCheckedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Managed by {integration.managedBy}
                  </Badge>
                  <Badge variant="outline">
                    {integration.supportsVerification ? "Verifiable" : "Static"}
                  </Badge>
                  <Badge variant="outline">
                    {integration.supportsAdminEdits ? "Admin configurable" : "Env only"}
                  </Badge>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {integration.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
