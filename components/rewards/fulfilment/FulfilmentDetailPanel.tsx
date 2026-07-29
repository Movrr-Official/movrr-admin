"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import type { FulfilmentEvent } from "@/features/fulfilment/domain/Fulfilment";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import { FulfilmentStateBadge } from "@/components/fulfilment/FulfilmentStateBadge";
import {
  formatFulfilmentState,
  formatFulfilmentType,
  formatRiderProgress,
} from "@/features/fulfilment/presentation";
import { FulfilmentTimeline } from "./FulfilmentTimeline";
import {
  FulfilmentActionsDialog,
  type FulfilmentActionKind,
} from "./FulfilmentActionsDialog";

type FulfilmentDetailPanelProps = {
  fulfilment: FulfilmentReadModel | undefined;
  events: FulfilmentEvent[] | undefined;
  isLoadingDetail: boolean;
  isLoadingTimeline: boolean;
  errorMessage?: string | null;
  onRefetch?: () => void;
};

function Field({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium break-all">{value}</div>
    </div>
  );
}

export function FulfilmentDetailPanel({
  fulfilment,
  events,
  isLoadingDetail,
  isLoadingTimeline,
  errorMessage,
  onRefetch,
}: FulfilmentDetailPanelProps) {
  const [action, setAction] = useState<FulfilmentActionKind | null>(null);

  if (isLoadingDetail) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading fulfilment…
      </div>
    );
  }

  if (errorMessage || !fulfilment) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={FULFILMENT_ROUTES.queue}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to queue
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {errorMessage ?? "Fulfilment not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={FULFILMENT_ROUTES.queue}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to queue
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <FulfilmentStateBadge state={fulfilment.state} />
          <Badge variant="outline">v{fulfilment.version}</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAction("cancel")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAction("refund")}
          >
            Refund
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg font-mono">{fulfilment.id}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Ops view — values from Platform API (no client state machine).
            Cancel/refund go through `/api/v1` only.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="State" value={formatFulfilmentState(fulfilment.state)} />
          <Field label="Outcome" value={fulfilment.outcome ?? "—"} />
          <Field
            label="Progress"
            value={formatRiderProgress(fulfilment.progress)}
          />
          <Field
            label="Type"
            value={formatFulfilmentType(fulfilment.fulfilmentType)}
          />
          <Field label="Version" value={fulfilment.version} />
          <Field label="Partner org" value={fulfilment.partnerOrgId ?? "—"} />
          <Field label="Rider" value={fulfilment.riderId} />
          <Field label="Redemption" value={fulfilment.redemptionId} />
          <Field label="Catalog item" value={fulfilment.catalogItemId} />
          <Field
            label="Expires"
            value={
              fulfilment.expiresAt
                ? new Date(fulfilment.expiresAt).toLocaleString()
                : "—"
            }
          />
          <Field
            label="Completed"
            value={
              fulfilment.completedAt
                ? new Date(fulfilment.completedAt).toLocaleString()
                : "—"
            }
          />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <FulfilmentTimeline
            events={events ?? []}
            isLoading={isLoadingTimeline}
          />
        </CardContent>
      </Card>

      <FulfilmentActionsDialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        action={action}
        fulfilmentId={fulfilment.id}
        expectedVersion={fulfilment.version}
        onConcurrencyConflict={onRefetch}
        onSuccess={onRefetch}
      />
    </div>
  );
}
