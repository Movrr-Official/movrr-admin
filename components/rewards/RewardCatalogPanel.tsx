"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/useToast";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import RewardCatalogTableContent from "@/components/rewards/RewardCatalogTableContent";
import { RewardProductDetailsDrawer } from "@/components/rewards/RewardProductDetailsDrawer";
import { RewardCatalogItem } from "@/schemas";
import { useRewardCatalogData } from "@/hooks/useRewardCatalogData";
import { DataTableContainer } from "@/context/DataTableContext";
import {
  toggleRewardFeatured,
  updateRewardCatalogStatus,
} from "@/app/actions/rewardCatalog";

export function RewardCatalogPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: catalog, isLoading, refetch } = useRewardCatalogData();
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [selectedItem, setSelectedItem] = useState<RewardCatalogItem | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const items = catalog ?? [];

  useEffect(() => {
    if (!selectedId) {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        setSelectedItem(null);
      }
      return;
    }
    const found = items.find((item) => item.id === selectedId) ?? null;
    setSelectedItem(found);
    setIsDrawerOpen(Boolean(found));
  }, [selectedId, items]);

  useEffect(() => {
    if (!selectedItem || !isDrawerOpen) return;

    const latest = items.find((item) => item.id === selectedItem.id);
    if (!latest) {
      setIsDrawerOpen(false);
      setSelectedItem(null);
      setSelectedId(null);
      return;
    }

    if (
      latest.updatedAt !== selectedItem.updatedAt ||
      latest.title !== selectedItem.title ||
      latest.status !== selectedItem.status ||
      latest.sku !== selectedItem.sku ||
      latest.pointsPrice !== selectedItem.pointsPrice ||
      latest.thumbnailUrl !== selectedItem.thumbnailUrl ||
      latest.fulfilmentType !== selectedItem.fulfilmentType ||
      latest.resourceId !== selectedItem.resourceId
    ) {
      setSelectedItem(latest);
    }
  }, [items, selectedItem, isDrawerOpen, setSelectedId]);

  const openProductDrawer = (item: RewardCatalogItem) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
    setSelectedId(item.id);
  };

  const handleDrawerOpenChange = (open: boolean) => {
    setIsDrawerOpen(open);
    if (!open) {
      setSelectedItem(null);
      setSelectedId(null);
    }
  };

  const handleCreate = () => {
    router.push("/rewards/catalog/create");
  };

  const handlePublish = async (item: RewardCatalogItem) => {
    const result = await updateRewardCatalogStatus({
      id: item.id,
      status: "active",
    });
    if (!result.success) {
      toast({
        title: "Publish failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    await refetch();
  };

  const handlePause = async (item: RewardCatalogItem) => {
    const result = await updateRewardCatalogStatus({
      id: item.id,
      status: "paused",
    });
    if (!result.success) {
      toast({
        title: "Pause failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    await refetch();
  };

  const handleArchive = async (item: RewardCatalogItem) => {
    const result = await updateRewardCatalogStatus({
      id: item.id,
      status: "archived",
    });
    if (!result.success) {
      toast({
        title: "Archive failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    await refetch();
  };

  const handleToggleFeatured = async (item: RewardCatalogItem) => {
    const result = await toggleRewardFeatured({
      id: item.id,
      isFeatured: !item.isFeatured,
      featuredRank: item.featuredRank ?? 1,
    });
    if (!result.success) {
      toast({
        title: "Update failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    await refetch();
  };

  return (
    <>
      <DataTableContainer data={items} persistToUrl={true}>
        <RewardCatalogTableContent
          items={items}
          isLoading={isLoading}
          onCreate={handleCreate}
          onEdit={openProductDrawer}
          onRowClick={openProductDrawer}
          onPublish={handlePublish}
          onPause={handlePause}
          onArchive={handleArchive}
          onToggleFeatured={handleToggleFeatured}
          toolbar={true}
          searchBar={false}
          refetchData={refetch}
        />
      </DataTableContainer>

      <RewardProductDetailsDrawer
        item={selectedItem}
        open={isDrawerOpen && Boolean(selectedItem)}
        onOpenChange={handleDrawerOpenChange}
        onSaved={refetch}
      />
    </>
  );
}
