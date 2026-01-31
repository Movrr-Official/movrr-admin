"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import RewardCatalogTableContent from "@/components/rewards/RewardCatalogTableContent";
import { RewardCatalogItem } from "@/schemas";
import { useRewardCatalogData } from "@/hooks/useRewardCatalogData";
import { shouldUseMockData } from "@/lib/dataSource";
import { DataTableContainer } from "@/context/DataTableContext";
import {
  toggleRewardFeatured,
  updateRewardCatalogStatus,
  upsertRewardCatalog,
} from "@/app/actions/rewardCatalog";

const inventoryOptions = ["unlimited", "limited"] as const;
const statusOptions = ["draft", "active", "paused", "archived"] as const;

export function RewardCatalogPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const useMock = shouldUseMockData();
  const { data: catalog, isLoading, refetch } = useRewardCatalogData();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RewardCatalogItem | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState({
    sku: "",
    title: "",
    description: "",
    category: "",
    status: "draft",
    pointsPrice: "",
    partnerName: "",
    partnerUrl: "",
    thumbnailUrl: "",
    galleryUrls: "",
    inventoryType: "unlimited",
    inventoryCount: "",
    maxPerRider: "",
    featuredRank: "",
    isFeatured: false,
    tags: "",
  });

  const resetForm = (item?: RewardCatalogItem | null) => {
    if (!item) {
      setFormState({
        sku: "",
        title: "",
        description: "",
        category: "",
        status: "draft",
        pointsPrice: "",
        partnerName: "",
        partnerUrl: "",
        thumbnailUrl: "",
        galleryUrls: "",
        inventoryType: "unlimited",
        inventoryCount: "",
        maxPerRider: "",
        featuredRank: "",
        isFeatured: false,
        tags: "",
      });
      return;
    }

    setFormState({
      sku: item.sku,
      title: item.title,
      description: item.description ?? "",
      category: item.category,
      status: item.status,
      pointsPrice: String(item.pointsPrice),
      partnerName: item.partnerName ?? "",
      partnerUrl: item.partnerUrl ?? "",
      thumbnailUrl: item.thumbnailUrl ?? "",
      galleryUrls: (item.galleryUrls ?? []).join(","),
      inventoryType: item.inventoryType,
      inventoryCount: item.inventoryCount?.toString() ?? "",
      maxPerRider: item.maxPerRider?.toString() ?? "",
      featuredRank: item.featuredRank?.toString() ?? "",
      isFeatured: item.isFeatured ?? false,
      tags: (item.tags ?? []).join(","),
    });
  };

  const handleCreate = () => {
    router.push("/rewards/catalog/create");
  };

  const handleEdit = (item: RewardCatalogItem) => {
    setEditingItem(item);
    resetForm(item);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (useMock) {
      toast({
        title: "Mock mode",
        description: "Catalog editing is disabled while mock data is enabled.",
      });
      return;
    }

    if (!formState.title.trim() || !formState.sku.trim()) {
      toast({
        title: "Missing required fields",
        description: "SKU and title are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const result = await upsertRewardCatalog({
      id: editingItem?.id,
      sku: formState.sku.trim(),
      title: formState.title.trim(),
      description: formState.description.trim() || undefined,
      category: formState.category.trim() || "general",
      status: formState.status as RewardCatalogItem["status"],
      pointsPrice: Number(formState.pointsPrice || 0),
      partnerName: formState.partnerName.trim() || undefined,
      partnerUrl: formState.partnerUrl.trim() || undefined,
      thumbnailUrl: formState.thumbnailUrl.trim() || undefined,
      galleryUrls: formState.galleryUrls
        ? formState.galleryUrls
            .split(",")
            .map((url) => url.trim())
            .filter(Boolean)
        : undefined,
      inventoryType:
        formState.inventoryType as RewardCatalogItem["inventoryType"],
      inventoryCount:
        formState.inventoryType === "limited"
          ? Number(formState.inventoryCount || 0)
          : undefined,
      maxPerRider: formState.maxPerRider
        ? Number(formState.maxPerRider)
        : undefined,
      featuredRank: formState.featuredRank
        ? Number(formState.featuredRank)
        : undefined,
      isFeatured: formState.isFeatured,
      tags: formState.tags
        ? formState.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
    });
    setIsSaving(false);

    if (!result.success) {
      toast({
        title: "Save failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsDialogOpen(false);
    await refetch();
    toast({
      title: "Catalog updated",
      description: "Reward catalog item saved successfully.",
    });
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

  const dialogTitle = "Edit reward product";
  const dialogDescription =
    "Update catalog details that appear in the rider rewards shop.";

  return (
    <>
      <DataTableContainer data={catalog ?? []} persistToUrl={true}>
        <RewardCatalogTableContent
          items={catalog ?? []}
          isLoading={isLoading}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onPublish={handlePublish}
          onPause={handlePause}
          onArchive={handleArchive}
          onToggleFeatured={handleToggleFeatured}
          toolbar={true}
          searchBar={false}
          refetchData={refetch}
        />
      </DataTableContainer>

      <Dialog
        open={isDialogOpen && Boolean(editingItem)}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingItem(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formState.sku}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      sku: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formState.title}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={formState.category}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Points</Label>
                <Input
                  type="number"
                  min={0}
                  value={formState.pointsPrice}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      pointsPrice: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Partner name</Label>
                <Input
                  value={formState.partnerName}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      partnerName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Partner URL</Label>
                <Input
                  value={formState.partnerUrl}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      partnerUrl: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Thumbnail URL</Label>
                <Input
                  value={formState.thumbnailUrl}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      thumbnailUrl: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Gallery URLs (comma separated)</Label>
                <Input
                  value={formState.galleryUrls}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      galleryUrls: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Inventory type</Label>
                <Select
                  value={formState.inventoryType}
                  onValueChange={(value) =>
                    setFormState((prev) => ({
                      ...prev,
                      inventoryType: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select inventory" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Inventory count</Label>
                <Input
                  type="number"
                  min={0}
                  value={formState.inventoryCount}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      inventoryCount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max per rider</Label>
                <Input
                  type="number"
                  min={1}
                  value={formState.maxPerRider}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      maxPerRider: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Featured rank</Label>
                <Input
                  type="number"
                  min={1}
                  value={formState.featuredRank}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      featuredRank: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={formState.tags}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      tags: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.isFeatured}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      isFeatured: event.target.checked,
                    }))
                  }
                />
                <span className="text-sm">Mark as featured</span>
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
