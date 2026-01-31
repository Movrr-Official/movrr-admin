"use client";

import React from "react";
import { DataTable } from "@/components/table/DataTable";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { Button } from "@/components/ui/button";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { RewardCatalogItem } from "@/schemas";
import { getRewardCatalogTableColumns } from "./RewardCatalogTableColumns";
import { Gift } from "lucide-react";

interface RewardCatalogTableContentProps {
  items: RewardCatalogItem[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  onCreate: () => void;
  onEdit: (item: RewardCatalogItem) => void;
  onPublish: (item: RewardCatalogItem) => void;
  onPause: (item: RewardCatalogItem) => void;
  onArchive: (item: RewardCatalogItem) => void;
  onToggleFeatured: (item: RewardCatalogItem) => void;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function RewardCatalogTableContent({
  items,
  isLoading,
  toolbar = true,
  searchBar = true,
  onCreate,
  onEdit,
  onPublish,
  onPause,
  onArchive,
  onToggleFeatured,
  refetchData,
  isRefetching = false,
}: RewardCatalogTableContentProps) {
  if (isLoading) {
    return <DataTableSkeleton />;
  }

  const columns = React.useMemo(
    () =>
      getRewardCatalogTableColumns({
        onEdit,
        onPublish,
        onPause,
        onArchive,
        onToggleFeatured,
      }),
    [onEdit, onPublish, onPause, onArchive, onToggleFeatured],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Reward Catalog</h3>
          <p className="text-sm text-muted-foreground">
            Manage products available in the rider rewards shop.
          </p>
        </div>
        <Button onClick={onCreate}>New Product</Button>
      </div>
      {/* Toolbar */}
      {toolbar && (
        <DataTableToolbar
          search={{
            enabled: true,
            placeholder: "Search reward catalog...",
            paramKey: "catalogSearch",
          }}
          refresh={{
            enabled: true,
            onRefresh: refetchData,
            isLoading: isRefetching,
          }}
        />
      )}

      <DataTable
        columns={columns}
        data={items}
        searchKey="catalogSearch"
        searchFields={["title", "sku", "category"]}
        searchParamKey="catalogSearch"
        title="Reward Catalog"
        description={`Products (${items.length})`}
        emptyStateTitle="No reward products"
        emptyStateDescription="Create your first reward product to publish it to riders."
        emptyStateIcon={Gift}
        searchBar={searchBar}
      />
    </div>
  );
}
