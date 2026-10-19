"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FulfilmentQueuePanel } from "@/components/rewards/fulfilment/FulfilmentQueuePanel";
import { useFulfilmentQueue, useShopHealth } from "@/hooks/useFulfilmentOpsData";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCapability } from "@/hooks/useAdminUser";
import { FulfilmentActionsDialog } from "@/components/rewards/fulfilment/FulfilmentActionsDialog";
import { useOrganisations } from "@/hooks/useOrganisationsData";

export default function FulfilmentOpsQueuePage() {
  const searchParams = useSearchParams();
  const health = useShopHealth();
  const canCancel = useCapability("fulfilment.cancel");
  const [legacy, setLegacy] = useState<{id: string; status: "requested" | "approved"} | null>(null);
  const organisations = useOrganisations("reward_partner");

  const filters = useMemo(() => {
    // Platform list API accepts a single status/type. When the bar has
    // multi-select values, omit the API filter and let the table filter client-side.
    const statusValues = (searchParams.get("status") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const typeValues = (searchParams.get("type") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const partnerOrgId = searchParams.get("partnerOrgId")?.trim() || undefined;

    return {
      status: statusValues.length === 1 ? statusValues[0] : undefined,
      type: typeValues.length === 1 ? typeValues[0] : undefined,
      partnerOrgId,
    };
  }, [searchParams]);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useFulfilmentQueue(filters);

  const partnerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const org of organisations.data ?? []) {
      map[org.id] =
        org.partnerProfile?.name?.trim() || org.name?.trim() || org.id;
    }
    return map;
  }, [organisations.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment Queue"
        description="Live operational queue from the Platform API. A single state or type filter is sent as a query param; multiple selections filter the loaded queue in the table."
      />

      {health.isError && <Alert variant="destructive"><AlertDescription>Recovery monitoring is unavailable. Refresh before relying on queue completeness.</AlertDescription></Alert>}
      {health.data && <Alert variant={health.data.recoveryFailures + health.data.deliveryFailures + (health.data.walletMismatches ?? 0) + (health.data.unpairedPaidClaims ?? 0) + (health.data.freeFinancialEntries ?? 0) > 0 ? "destructive" : "default"}><AlertDescription>
        Recovery: {health.data.recoveryFailures} failures · Delivery: {health.data.deliveryFailures} failures, {health.data.pendingDelivery} pending · Overdue: {health.data.overdue} · Ledger discrepancies: {(health.data.walletMismatches ?? 0) + (health.data.unpairedPaidClaims ?? 0) + (health.data.freeFinancialEntries ?? 0)}
        {health.data.scheduler && <span className="ml-3">Scheduler: {health.data.scheduler.active ? "Active" : "Inactive"}; {health.data.scheduler.transportError ?? (health.data.scheduler.httpStatus === 200 ? "Last run accepted" : "Awaiting accepted run")}; {health.data.scheduler.lastDispatchAt ? new Date(health.data.scheduler.lastDispatchAt).toLocaleString() : "Not run yet"}</span>}
        {health.data.recoveryCases.map(row => <Link key={row.id} className="ml-3 underline" href={`/fulfilment/queue/${row.id}`}>{row.id.slice(0,8)} · {row.attempts} attempts</Link>)}
      </AlertDescription></Alert>}
      {!!health.data?.legacyReservations?.length && <Alert><AlertDescription>
        Historical reservations need staff review. No automated fulfillment is claimed for these requests.
        {health.data.legacyReservations.map(row => <div key={row.id} className="mt-2 flex items-center justify-between gap-3"><span>{row.title || row.id} ? {row.pointsReserved} points reserved ? {row.status}</span>{canCancel && <Button variant="outline" size="sm" onClick={() => setLegacy(row)}>Review cancellation</Button>}</div>)}
      </AlertDescription></Alert>}
      <FulfilmentActionsDialog open={!!legacy} onOpenChange={open => {if (!open) setLegacy(null);}} action="legacy_cancel" fulfilmentId={legacy?.id ?? ""} expectedVersion={0} legacyStatus={legacy?.status} onSuccess={() => { setLegacy(null); void health.refetch(); }} onConcurrencyConflict={() => void health.refetch()} />
      <FulfilmentQueuePanel
        rows={data ?? []}
        partnerNames={partnerNames}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
      />
    </div>
  );
}
