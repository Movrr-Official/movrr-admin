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
    const status = searchParams.get("status")?.trim() || undefined;
    const type = searchParams.get("type")?.trim() || undefined;
    const partnerOrgId = searchParams.get("partnerOrgId")?.trim() || undefined;
    return { status, type, partnerOrgId };
  }, [searchParams]);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useFulfilmentQueue(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment Queue"
        description="Live operational queue from the Platform API. State and type filters are sent as query params — no client-side business rules."
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
