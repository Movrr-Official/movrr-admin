"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ResourcePoolsTablePanel } from "@/components/rewards/resources/ResourcePoolsTablePanel";
import { ImportPoolCodesDialog } from "@/components/rewards/resources/ImportPoolCodesDialog";
import type { ResourcePoolRow } from "@/components/rewards/resources/ResourcePoolsTableColumns";
import { useResourcePools } from "@/hooks/useResourcePoolsData";
import { useOrganisations } from "@/hooks/useOrganisationsData";

export default function ResourcePoolsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useResourcePools();
  const organisations = useOrganisations("reward_partner");
  const [importOpen, setImportOpen] = useState(false);
  const [importResourceId, setImportResourceId] = useState<string | null>(null);

  const partnerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const org of organisations.data ?? []) {
      map[org.id] =
        org.partnerProfile?.name?.trim() || org.name?.trim() || org.id;
    }
    return map;
  }, [organisations.data]);

  const openImport = (pool?: ResourcePoolRow | null) => {
    setImportResourceId(pool?.id ?? null);
    setImportOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resource Pools"
        description="Operational capacity — voucher pools, generated codes, and inventory health from Platform API read models."
      />

      <ResourcePoolsTablePanel
        pools={data ?? []}
        partnerNames={partnerNames}
        isLoading={isLoading}
        isError={isError}
        errorMessage={(error as Error)?.message}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
        onImportCodes={openImport}
      />

      <ImportPoolCodesDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportResourceId(null);
        }}
        defaultResourceId={importResourceId}
      />
    </div>
  );
}
