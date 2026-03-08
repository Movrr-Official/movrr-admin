"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminSettingsResponse } from "@/schemas/settings";

type Props = {
  settings: AdminSettingsResponse;
};

export function BillingSection({ settings }: Props) {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Billing Not Yet Connected</AlertTitle>
        <AlertDescription>{settings.runtime.billing.message}</AlertDescription>
      </Alert>
      <Card className="glass-card border-0">
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Connection Status</div>
            <div className="mt-1 capitalize">
              {settings.values.billing.connectionStatus.replaceAll("_", " ")}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Plan</div>
            <div className="mt-1">{settings.values.billing.planName}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Plan Status</div>
            <div className="mt-1 capitalize">{settings.values.billing.planStatus}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Invoice Contact</div>
            <div className="mt-1">
              {settings.values.billing.invoiceContactEmail || "Not configured"}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground md:col-span-2">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CreditCard className="h-4 w-4" />
              Usage Summary
            </div>
            <div className="mt-1">{settings.values.billing.usageSummary}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm text-muted-foreground md:col-span-2">
            <div className="font-medium text-foreground">Entitlements</div>
            <div className="mt-1">
              {settings.values.billing.entitlements.length > 0
                ? settings.values.billing.entitlements.join(", ")
                : "No billing entitlements are currently connected."}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
