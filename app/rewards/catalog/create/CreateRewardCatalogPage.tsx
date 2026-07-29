"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/useToast";
import { shouldUseMockData } from "@/lib/dataSource";
import { upsertRewardCatalog } from "@/app/actions/rewardCatalog";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import { SUPPORTED_REDEEM_FULFILMENT_TYPES } from "@/features/rewards/application/contracts/RedeemRewardCommand";
import { formatFulfilmentType } from "@/features/fulfilment/presentation";

const requiredNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => Number(value), schema);

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return Number(value);
  }, schema.optional());

const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  }, schema.optional());

const NONE = "__none__";

const rewardCatalogFormSchema = z
  .object({
    sku: z.string().min(3, "SKU is required."),
    title: z.string().min(3, "Title is required."),
    description: z.string().optional(),
    category: z.string().min(1, "Category is required."),
    status: z.enum(["draft", "active", "paused", "archived"]),
    pointsPrice: requiredNumber(z.number().int().min(0)),
    partnerName: z.string().optional(),
    partnerUrl: optionalString(z.string().url()),
    thumbnailUrl: optionalString(z.string().url()),
    galleryUrls: z.string().optional(),
    inventoryType: z.enum(["unlimited", "limited"]),
    inventoryCount: optionalNumber(z.number().int().min(0)),
    maxPerRider: optionalNumber(z.number().int().min(1)),
    featuredRank: optionalNumber(z.number().int().min(1)),
    isFeatured: z.boolean(),
    tags: z.string().optional(),
    fulfilmentType: z.enum(FULFILMENT_TYPES).optional(),
    resourceId: optionalString(z.string().uuid("Resource ID must be a UUID.")),
  })
  .superRefine((value, ctx) => {
    if (value.status === "active" && !value.fulfilmentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fulfilmentType"],
        message: "Active catalog items require a fulfilment_type.",
      });
    }
    if (
      value.status === "active" &&
      value.fulfilmentType &&
      !SUPPORTED_REDEEM_FULFILMENT_TYPES.includes(
        value.fulfilmentType as (typeof SUPPORTED_REDEEM_FULFILMENT_TYPES)[number],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fulfilmentType"],
        message:
          "This fulfilment type is not supported for redeem yet. Choose Instant Digital or QR / Barcode, or keep the item as draft.",
      });
    }
    if (value.status === "active" && !value.resourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourceId"],
        message: "Active catalog items require a resource binding.",
      });
    }
  });

type RewardCatalogFormValues = z.infer<typeof rewardCatalogFormSchema>;

export default function CreateRewardCatalogPage() {
  const router = useRouter();
  const { toast } = useToast();
  const useMockData = shouldUseMockData();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RewardCatalogFormValues>({
    resolver: zodResolver(rewardCatalogFormSchema),
    defaultValues: {
      sku: "",
      title: "",
      description: "",
      category: "",
      status: "draft",
      pointsPrice: 0,
      partnerName: "",
      partnerUrl: "",
      thumbnailUrl: "",
      galleryUrls: "",
      inventoryType: "unlimited",
      inventoryCount: undefined,
      maxPerRider: undefined,
      featuredRank: undefined,
      isFeatured: false,
      tags: "",
      fulfilmentType: undefined,
      resourceId: undefined,
    },
  });

  const onSubmit = async (values: RewardCatalogFormValues) => {
    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Catalog editing is disabled while mock data is enabled.",
      });
      return;
    }

    setIsSubmitting(true);

    const result = await upsertRewardCatalog({
      sku: values.sku.trim(),
      title: values.title.trim(),
      description: values.description?.trim() || undefined,
      category: values.category.trim(),
      status: values.status,
      pointsPrice: Number(values.pointsPrice),
      partnerName: values.partnerName?.trim() || undefined,
      partnerUrl: values.partnerUrl?.trim() || undefined,
      thumbnailUrl: values.thumbnailUrl?.trim() || undefined,
      galleryUrls: values.galleryUrls
        ? values.galleryUrls
            .split(",")
            .map((url) => url.trim())
            .filter(Boolean)
        : undefined,
      inventoryType: values.inventoryType,
      inventoryCount:
        values.inventoryType === "limited"
          ? Number(values.inventoryCount || 0)
          : undefined,
      maxPerRider: values.maxPerRider ? Number(values.maxPerRider) : undefined,
      featuredRank: values.featuredRank
        ? Number(values.featuredRank)
        : undefined,
      isFeatured: values.isFeatured,
      tags: values.tags
        ? values.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
      fulfilmentType: values.fulfilmentType ?? null,
      resourceId: values.resourceId?.trim() || null,
    });

    setIsSubmitting(false);

    if (!result.success) {
      toast({
        title: "Save failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Reward product created",
      description: "The new product is ready for publishing.",
    });

    router.push("/rewards");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Create Reward Product"
          description="Add a new item to the rewards catalog for riders."
          action={{
            label: "Back to Rewards",
            href: "/rewards",
            icon: <ArrowLeft className="h-4 w-4" />,
            asChild: true,
          }}
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Core Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="MOVRR-HELMET-URBAN-001"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Urban Commuter Helmet"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Lightweight helmet with integrated rear light."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="safety" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="archived">Archived</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle>Fulfilment</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Active items must use a redeem-supported fulfilment type and
                  bind a resource. Unsupported types can stay in draft.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fulfilmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fulfilment type</FormLabel>
                      <Select
                        value={field.value ?? NONE}
                        onValueChange={(value) =>
                          field.onChange(value === NONE ? undefined : value)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select fulfilment type" />
                          </SelectTrigger>
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="resourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="fulfilment resource uuid"
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle>Partner & Media</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="partnerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partner name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="RideSafe" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="partnerUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partner URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://partner.example"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="thumbnailUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thumbnail URL</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="galleryUrls"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gallery URLs (comma separated)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://..., https://..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle>Inventory & Visibility</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="inventoryType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inventory type</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select inventory" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unlimited">Unlimited</SelectItem>
                            <SelectItem value="limited">Limited</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="inventoryCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inventory count</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxPerRider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max per rider</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="featuredRank"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Featured rank</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags (comma separated)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="safety, helmet" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isFeatured"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">
                          Mark as featured
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Featured items appear first in the rider shop.
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/rewards")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Create product"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
