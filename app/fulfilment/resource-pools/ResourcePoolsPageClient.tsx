"use client";

import { useState } from "react";
import { Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResourcePoolTable } from "@/components/rewards/resources/ResourcePoolTable";
import { ImportPoolCodesDialog } from "@/components/rewards/resources/ImportPoolCodesDialog";
import { useResourcePools } from "@/hooks/useResourcePoolsData";

export default function ResourcePoolsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useResourcePools();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes className="h-6 w-6" />
            Resource pools
          </h1>
          <p className="text-sm text-muted-foreground">
            Operational capacity — voucher pools, generated codes, and inventory
            health from Platform API read models.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            Import codes
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Pools</CardTitle>
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
