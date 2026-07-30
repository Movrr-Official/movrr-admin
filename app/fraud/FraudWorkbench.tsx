"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Check, ExternalLink, Shield, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiGrid } from "@/components/ops/OpsKpiGrid";
import { useRideSessionsData } from "@/hooks/useRideSessionsData";
import { useCapability } from "@/hooks/useAdminUser";
import { useToast } from "@/hooks/useToast";
import { verifyRideSession } from "@/app/actions/rideSessions";
import type { RideSession } from "@/schemas";

const verificationBadge = (status: RideSession["verificationStatus"]) => {
  switch (status) {
    case "manual_review":
      return <Badge variant="warning">Manual review</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function FraudWorkbench() {
  const { data: sessions, isLoading, isFetching, refetch } =
    useRideSessionsData();
  const canResolve = useCapability("fraud.resolve");
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reviewQueue = (sessions ?? []).filter(
    (session) =>
      session.verificationStatus === "manual_review" ||
      session.verificationStatus === "pending",
  );

  const manualReviewCount = reviewQueue.filter(
    (session) => session.verificationStatus === "manual_review",
  ).length;
  const pendingCount = reviewQueue.filter(
    (session) => session.verificationStatus === "pending",
  ).length;

  const dispose = (sessionId: string, action: "approve" | "reject") => {
    setPendingId(sessionId);
    startTransition(async () => {
      const result = await verifyRideSession({
        sessionId,
        action,
        reason:
          action === "approve"
            ? "Fraud workbench approval"
            : "Fraud workbench rejection",
      });
      setPendingId(null);
      if (!result.success) {
        toast({
          title: "Disposition failed",
          description: result.error ?? "Unable to update verification",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: action === "approve" ? "Session verified" : "Session rejected",
      });
      void refetch();
    });
  };

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <PageHeader
          title="Fraud & Risk"
          description="Ride sessions flagged for manual review or pending verification."
          actions={[
            {
              label: isFetching ? "Refreshing…" : "Refresh",
              onClick: () => void refetch(),
              variant: "outline",
            },
            {
              label: "All ride sessions",
              href: "/ride-sessions",
              variant: "outline",
            },
          ]}
        />

        <OpsKpiGrid
          title="Verification queue"
          description="Sessions requiring operator attention before rewards settle."
          isLoading={isLoading}
          items={[
            {
              id: "total",
              label: "In queue",
              value: reviewQueue.length,
              tone: reviewQueue.length > 0 ? "warning" : "default",
            },
            {
              id: "manual",
              label: "Manual review",
              value: manualReviewCount,
              tone: manualReviewCount > 0 ? "warning" : "muted",
            },
            {
              id: "pending",
              label: "Pending verify",
              value: pendingCount,
            },
          ]}
        />

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <Shield className="h-5 w-5 text-muted-foreground" />
              Review queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading sessions…</p>
            ) : reviewQueue.length === 0 ? (
              <OpsEmptyState
                title="Queue is clear"
                description="No ride sessions are waiting for manual review or pending verification."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-3 pr-4 font-medium">Rider</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Campaign</th>
                      <th className="pb-3 pr-4 font-medium">Reason codes</th>
                      <th className="pb-3 pr-4 font-medium">Ended</th>
                      <th className="pb-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewQueue.map((session) => (
                      <tr
                        key={session.id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">
                            {session.riderName ?? "Unknown"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {session.id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          {verificationBadge(session.verificationStatus)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {session.campaignName ?? "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {session.reasonCodes?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {session.reasonCodes.map((code) => (
                                <Badge key={code} variant="outline" className="text-xs">
                                  {code}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {session.endedAt
                            ? formatDistanceToNow(new Date(session.endedAt), {
                                addSuffix: true,
                              })
                            : "In progress"}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {canResolve && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={isPending && pendingId === session.id}
                                  onClick={() => dispose(session.id, "approve")}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Verify
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isPending && pendingId === session.id}
                                  onClick={() => dispose(session.id, "reject")}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/ride-sessions?id=${session.id}`}>
                                Open
                                <ExternalLink className="ml-2 h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
