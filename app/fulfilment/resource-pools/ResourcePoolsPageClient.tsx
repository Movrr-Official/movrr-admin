"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { ResourcePoolTable } from "@/components/rewards/resources/ResourcePoolTable";
import { ImportPoolCodesDialog } from "@/components/rewards/resources/ImportPoolCodesDialog";
import { useResourcePools } from "@/hooks/useResourcePoolsData";

export default function ResourcePoolsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useResourcePools();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resource Pools"
        description="Operational capacity — voucher pools, generated codes, and inventory health from Platform API read models."
        actions={[
          {
            label: isFetching ? "Refreshing…" : "Refresh",
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: () => void refetch(),
            variant: "outline",
          },
          {
            label: "Import Codes",
            onClick: () => setImportOpen(true),
          },
        ]}
      />

      <Card className="border-border animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">Pools</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load resource pools"}
            </p>
          ) : (
            <ResourcePoolTable rows={data ?? []} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>

      <ImportPoolCodesDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
