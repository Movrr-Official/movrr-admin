"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { escalateAccountDeletion } from "@/app/actions/accountDeletion";
import { dashboardRead } from "@/lib/dashboard/readTransport";
import { isAccountDeletionReceipt, type AccountDeletionReceipt } from "@/lib/accountDeletionContract";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCapability } from "@/hooks/useAdminUser";
import { AccountDeletionReview } from "@/components/ops/AccountDeletionReview";
import { AccountDeletionRestorePreparation } from "@/components/ops/AccountDeletionRestorePreparation";
import { AccountDeletionIntakeControl } from "@/components/ops/AccountDeletionIntakeControl";
import type { DeletionReviewCategory } from "@/app/actions/accountDeletion";

type MonitorRow = AccountDeletionReceipt & { stale?: boolean; openReviews?: number };
export function AccountDeletionMonitor() {
  const canMonitor = useCapability("privacy.deletion.monitor");
  const canEscalate = useCapability("privacy.deletion.escalate");
  const canFinance = useCapability("privacy.deletion.finance.review");
  const canOperations = useCapability("privacy.deletion.operations.review");
  const canCompliance = useCapability("privacy.deletion.compliance.review");
  const canRecover = useCapability("privacy.deletion.recovery");
  const categories = ([['finance', canFinance], ['operations', canOperations], ['compliance', canCompliance], ['recovery', canRecover]] as const).filter(([, allowed]) => allowed).map(([category]) => category);
  const [selection, setSelection] = useState<{ requestId: string; category: DeletionReviewCategory } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["account-deletion-monitor"],
    retry: false,
    enabled: canMonitor,
    queryFn: async (): Promise<MonitorRow[]> => {
      const result = await dashboardRead("deletionMonitor");
      if (!result.success) throw new Error(result.error);
      if (!Array.isArray(result.data) || !result.data.every(isAccountDeletionReceipt))
        throw new Error("Unsupported deletion contract");
      return result.data as MonitorRow[];
    },
  });
  async function escalate(id: string) {
    setBusy(true);
    try {
      const result = await escalateAccountDeletion(id);
      setMessage(result.success ? "Incident escalated. Processing and leases are unchanged." : result.error);
      if (result.success) await query.refetch();
    } finally { setBusy(false); }
  }
  if (!canMonitor) return null;
  return <Card className="border-border">
    <CardHeader><CardTitle>Account deletion review</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <AccountDeletionIntakeControl />
      <p className="text-sm text-muted-foreground">Contract v1. Destructive processing and retention purges require verified schema coverage and policy approvals. No schedule is enabled by this panel.</p>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh deletion requests</Button>
      {canRecover && <AccountDeletionRestorePreparation onPrepared={() => query.refetch()} />}
      {query.isLoading && <p>Loading requests…</p>}
      {query.error && <p role="alert">Deletion monitoring is unavailable or access is restricted.</p>}
      {query.data?.length === 0 && <p>No deletion requests recorded.</p>}
      {query.data?.map(row => <div key={row.requestId} className="rounded border border-border p-3 text-sm">
        <p className="font-mono">{row.requestId}</p>
        <p>{row.status.replaceAll("_", " ")} · Policy v{row.policyVersion} · {row.openReviews ?? 0} open reviews</p>
        {row.stale && <p role="status">Stale invocation: confirm termination before considering recovery.</p>}
        {canEscalate && row.status !== "completed" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void escalate(row.requestId)}>Escalate incident</Button>}
        <div className="mt-2 flex flex-wrap gap-2">{categories.map(category => <Button key={category} variant="outline" size="sm" onClick={() => setSelection({ requestId: row.requestId, category })}>{category} review</Button>)}</div>
        {selection?.requestId === row.requestId && <AccountDeletionReview key={row.requestId + selection.category} requestId={row.requestId} category={selection.category} />}
      </div>)}
      {message && <p role="status">{message}</p>}
    </CardContent>
  </Card>;
}
