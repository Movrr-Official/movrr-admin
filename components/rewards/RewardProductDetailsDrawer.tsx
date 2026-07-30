"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/useToast";
import { RewardCatalogItem } from "@/schemas";
import { shouldUseMockData } from "@/lib/dataSource";
import { upsertRewardCatalog } from "@/app/actions/rewardCatalog";
import { RewardCatalogMediaFields } from "@/components/rewards/RewardCatalogMediaFields";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { SUPPORTED_REDEEM_FULFILMENT_TYPES } from "@/features/rewards/application/contracts/RedeemRewardCommand";
import {
  formatFulfilmentType,
  humanizeEnumToken,
} from "@/features/fulfilment/presentation";

const inventoryOptions = ["unlimited", "limited"] as const;
const statusOptions = ["draft", "active", "paused", "archived"] as const;
const NONE = "__none__";

type FormState = {
  sku: string;
  title: string;
  description: string;
  category: string;
  status: string;
  pointsPrice: string;
  partnerName: string;
  partnerUrl: string;
  thumbnailUrl: string;
  galleryUrls: string;
  inventoryType: string;
  inventoryCount: string;
  maxPerRider: string;
  featuredRank: string;
  isFeatured: boolean;
  tags: string;
  fulfilmentType: string;
  resourceId: string;
};

function emptyForm(): FormState {
  return {
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
    fulfilmentType: "",
    resourceId: "",
  };
}

function formFromItem(item: RewardCatalogItem): FormState {
  return {
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
    fulfilmentType: item.fulfilmentType ?? "",
    resourceId: item.resourceId ?? "",
  };
}

function statusBadge(status: RewardCatalogItem["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="success">Active</Badge>;
    case "paused":
      return <Badge variant="warning">Paused</Badge>;
    case "archived":
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

interface RewardProductDetailsDrawerProps {
  item: RewardCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function RewardProductDetailsDrawer({
  item,
  open,
  onOpenChange,
  onSaved,
}: RewardProductDetailsDrawerProps) {
  const { toast } = useToast();
  const useMock = shouldUseMockData();
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!open) return;
    setFormState(item ? formFromItem(item) : emptyForm());
  }, [item, open]);

  const handleSave = async () => {
    if (!item) return;

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

    if (formState.status === "active") {
      if (!formState.fulfilmentType) {
        toast({
          title: "Fulfilment type required",
          description: "Active catalog items require a fulfilment_type.",
          variant: "destructive",
        });
        return;
      }
      if (
        !SUPPORTED_REDEEM_FULFILMENT_TYPES.includes(
          formState.fulfilmentType as (typeof SUPPORTED_REDEEM_FULFILMENT_TYPES)[number],
        )
      ) {
        toast({
          title: "Unsupported fulfilment type",
          description:
            "This fulfilment type is not supported for redeem yet. Choose Instant Digital or QR / Barcode, or keep the item as draft.",
          variant: "destructive",
        });
        return;
      }
      if (!formState.resourceId.trim()) {
        toast({
          title: "Resource binding required",
          description: "Active catalog items require a resource ID.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSaving(true);
    const result = await upsertRewardCatalog({
      id: item.id,
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
      fulfilmentType: formState.fulfilmentType
        ? (formState.fulfilmentType as NonNullable<
            RewardCatalogItem["fulfilmentType"]
          >)
        : null,
      resourceId: formState.resourceId.trim() || null,
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

    toast({
      title: "Catalog updated",
      description: "Reward catalog item saved successfully.",
    });
    onSaved?.();
    onOpenChange(false);
  };

  if (!item) return null;

  const galleryPreviewUrls = Array.from(
    new Set(
      [
        formState.thumbnailUrl.trim(),
        ...formState.galleryUrls
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const previewUrl =
    formState.thumbnailUrl.trim() || galleryPreviewUrls[0] || null;
  const initials = item.title
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-border h-full w-full sm:w-[360px] lg:max-w-[60rem]! p-0">
        <div className="flex h-full flex-col bg-background">
          <DrawerHeader className="border-b border-border/50 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt={item.title}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <DrawerTitle className="text-2xl font-bold truncate">
                    {item.title}
                  </DrawerTitle>
                  <DrawerDescription className="text-sm text-muted-foreground">
                    Update catalog details that appear in the rider rewards
                    shop.
                  </DrawerDescription>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {item.sku}
                    </span>
                    {statusBadge(item.status)}
                  </div>
                </div>
              </div>
              <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="space-y-6">
              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Media</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {galleryPreviewUrls.length > 0
                        ? `${galleryPreviewUrls.length} photo${galleryPreviewUrls.length === 1 ? "" : "s"}`
                        : "No photos"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RewardCatalogMediaFields
                    rewardId={item.id}
                    disabled={isSaving}
                    onPersisted={onSaved}
                    value={{
                      thumbnailUrl: formState.thumbnailUrl,
                      galleryUrls: formState.galleryUrls
                        ? formState.galleryUrls
                            .split(",")
                            .map((url) => url.trim())
                            .filter(Boolean)
                        : [],
                    }}
                    onChange={(next) =>
                      setFormState((prev) => ({
                        ...prev,
                        thumbnailUrl: next.thumbnailUrl,
                        galleryUrls: next.galleryUrls.join(","),
                      }))
                    }
                  />
                </CardContent>
              </Card>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Product details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reward-sku">SKU</Label>
                      <Input
                        id="reward-sku"
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
                      <Label htmlFor="reward-title">Title</Label>
                      <Input
                        id="reward-title"
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
                    <Label htmlFor="reward-description">Description</Label>
                    <Textarea
                      id="reward-description"
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reward-category">Category</Label>
                      <Input
                        id="reward-category"
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
                              {humanizeEnumToken(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reward-points">Points</Label>
                      <Input
                        id="reward-points"
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
                    <div className="space-y-2">
                      <Label htmlFor="reward-tags">Tags</Label>
                      <Input
                        id="reward-tags"
                        value={formState.tags}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            tags: event.target.value,
                          }))
                        }
                        placeholder="Comma-separated"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Partner</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reward-partner-name">Partner name</Label>
                      <Input
                        id="reward-partner-name"
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
                      <Label htmlFor="reward-partner-url">Partner URL</Label>
                      <Input
                        id="reward-partner-url"
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
                </CardContent>
              </Card>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Fulfilment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fulfilment type</Label>
                      <Select
                        value={formState.fulfilmentType || NONE}
                        onValueChange={(value) =>
                          setFormState((prev) => ({
                            ...prev,
                            fulfilmentType: value === NONE ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select fulfilment type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Not set</SelectItem>
                          {FULFILMENT_TYPES.map((type) => {
                            const supported =
                              SUPPORTED_REDEEM_FULFILMENT_TYPES.includes(
                                type as (typeof SUPPORTED_REDEEM_FULFILMENT_TYPES)[number],
                              );
                            return (
                              <SelectItem key={type} value={type}>
                                {formatFulfilmentType(type)}
                                {supported ? "" : " (unsupported for redeem)"}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reward-resource-id">Resource ID</Label>
                      <Input
                        id="reward-resource-id"
                        value={formState.resourceId}
                        onChange={(event) =>
                          setFormState((prev) => ({
                            ...prev,
                            resourceId: event.target.value,
                          }))
                        }
                        placeholder="fulfilment resource uuid"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active items require a redeem-supported type and resource
                    binding.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Inventory & featuring
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
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
                              {humanizeEnumToken(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reward-inventory-count">
                        Inventory count
                      </Label>
                      <Input
                        id="reward-inventory-count"
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
                      <Label htmlFor="reward-max-per-rider">Max per rider</Label>
                      <Input
                        id="reward-max-per-rider"
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
                    <div className="space-y-2">
                      <Label htmlFor="reward-featured-rank">Featured rank</Label>
                      <Input
                        id="reward-featured-rank"
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
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="reward-product-featured"
                        className="font-medium"
                      >
                        Featured product
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Show this item in featured shop placements.
                      </p>
                    </div>
                    <Switch
                      id="reward-product-featured"
                      checked={formState.isFeatured}
                      onCheckedChange={(checked) =>
                        setFormState((prev) => ({
                          ...prev,
                          isFeatured: checked,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DrawerFooter className="border-t border-border/50 px-6 py-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save product"}
              </Button>
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
