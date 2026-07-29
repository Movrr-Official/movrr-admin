"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { FulfilmentQueuePanel } from "@/components/rewards/fulfilment/FulfilmentQueuePanel";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";

export default function FulfilmentOpsQueuePage() {
  const searchParams = useSearchParams();

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment Queue"
        description="Live operational queue from the Platform API. A single state or type filter is sent as a query param; multiple selections filter the loaded queue in the table."
        action={{
          label: isFetching ? "Refreshing…" : "Refresh",
          icon: <RefreshCw className="h-4 w-4" />,
          onClick: () => void refetch(),
          variant: "outline",
        }}
      />

      <FulfilmentQueuePanel
        rows={data ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
      />
    </div>
  );
}
