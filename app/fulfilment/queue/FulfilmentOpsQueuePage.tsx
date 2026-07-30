"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FulfilmentQueuePanel } from "@/components/rewards/fulfilment/FulfilmentQueuePanel";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { useOrganisations } from "@/hooks/useOrganisationsData";

export default function FulfilmentOpsQueuePage() {
  const searchParams = useSearchParams();
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
