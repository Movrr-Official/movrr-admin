"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { FulfilmentQueuePanel } from "@/components/rewards/fulfilment/FulfilmentQueuePanel";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function CollectionsPageClient() {
  const awaiting = useFulfilmentQueue({ status: "awaiting_collection" });
  const validated = useFulfilmentQueue({ status: "validated" });
  const collected = useFulfilmentQueue({ status: "collected" });
  const organisations = useOrganisations("reward_partner");

  const partnerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const org of organisations.data ?? []) {
      map[org.id] =
        org.partnerProfile?.name?.trim() || org.name?.trim() || org.id;
    }
    return map;
  }, [organisations.data]);

  /** Partner action needed: awaiting collection + validated. */
  const awaitingRows = useMemo(() => {
    const merged = [...(awaiting.data ?? []), ...(validated.data ?? [])];
    const byId = new Map(merged.map((row) => [row.id, row]));
    return Array.from(byId.values());
  }, [awaiting.data, validated.data]);

  const collectedRows = collected.data ?? [];

  const awaitingLoading = awaiting.isLoading || validated.isLoading;
  const awaitingFetching = awaiting.isFetching || validated.isFetching;
  const awaitingError = awaiting.isError || validated.isError;
  const awaitingErrorMessage =
    (awaiting.error as Error | null)?.message ||
    (validated.error as Error | null)?.message;

  const refreshAwaiting = () => {
    void awaiting.refetch();
    void validated.refetch();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Collections"
        description="Partner collection worklists — confirm what’s waiting, then review what was recently collected."
        actions={[
          {
            label: "Partner Ops",
            href: FULFILMENT_ROUTES.partners,
            variant: "outline",
          },
        ]}
      />

      <FulfilmentQueuePanel
        variant="worklist"
        title="Awaiting collection"
        description={`Needs partner validation or confirmation (${awaitingRows.length})`}
        emptyTitle="Nothing waiting"
        emptyDescription="When riders redeem QR/collection rewards, items needing partner action appear here."
        searchParamKey="awaiting"
        exportFilename="collections_awaiting_export"
        rows={awaitingRows}
        partnerNames={partnerNames}
        isLoading={awaitingLoading}
        isError={awaitingError}
        errorMessage={awaitingErrorMessage}
        isFetching={awaitingFetching}
        onRefresh={refreshAwaiting}
      />

      <FulfilmentQueuePanel
        variant="worklist"
        title="Recently collected"
        description={`Confirmed collections (${collectedRows.length})`}
        emptyTitle="No recent collections"
        emptyDescription="After partners confirm collection, completed items show up in this list."
        searchParamKey="collected"
        exportFilename="collections_collected_export"
        rows={collectedRows}
        partnerNames={partnerNames}
        isLoading={collected.isLoading}
        isError={collected.isError}
        errorMessage={(collected.error as Error | null)?.message}
        isFetching={collected.isFetching}
        onRefresh={() => void collected.refetch()}
      />

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={FULFILMENT_ROUTES.queue}>Open full queue</Link>
        </Button>
      </div>
    </div>
  );
}
