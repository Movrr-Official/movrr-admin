"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2,
  Calendar,
  Edit,
  Globe,
  Loader2,
  Mail,
  Save,
  X,
} from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PartnerStaffPanel } from "@/components/rewards/partners/PartnerStaffPanel";
import {
  useOrganisation,
  useOrganisationStaff,
  useUpdateOrganisation,
} from "@/hooks/useOrganisationsData";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import {
  formatOrganisationStatus,
  formatOrganisationType,
  getOrganisationStatusPresentation,
  getOrganisationTypePresentation,
  humanizeEnumToken,
} from "@/features/organisations/presentation";
import type { OrganisationStatus } from "@/features/organisations/domain/Organisation";

const editOrganisationSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(120, "Name must be less than 120 characters"),
  status: z.enum(["active", "inactive", "suspended"]),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid email")]),
  website: z.union([
    z.literal(""),
    z.string().url("Enter a valid URL"),
  ]),
  logoUrl: z.union([
    z.literal(""),
    z.string().url("Enter a valid URL"),
  ]),
});

type EditOrganisationFormData = z.infer<typeof editOrganisationSchema>;

type OrganisationDetailsDrawerProps = {
  organisationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Drawer title context — Partners vs Organisations list. */
  title?: string;
  onOrganisationUpdate?: () => void;
};

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "text-sm"}>
        {value}
      </p>
    </div>
  );
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function OrganisationDetailsDrawer({
  organisationId,
  open,
  onOpenChange,
  title = "Organisation Details",
  onOrganisationUpdate,
}: OrganisationDetailsDrawerProps) {
  const { toast } = useToast();
  const id = organisationId ?? "";
  const organisation = useOrganisation(id);
  const staff = useOrganisationStaff(id);
  const updateOrganisation = useUpdateOrganisation();

  const [isEditMode, setIsEditMode] = useState(false);

  const org = organisation.data;
  const partner = org?.partnerProfile ?? null;
  const displayName = partner?.name?.trim() || org?.name || "Organisation";
  const logoUrl = partner?.logoUrl ?? null;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isRewardPartner = org?.type === "reward_partner";
  const isLoading = updateOrganisation.isPending;

  const form = useForm<EditOrganisationFormData>({
    resolver: zodResolver(editOrganisationSchema),
    defaultValues: {
      name: "",
      status: "active",
      contactEmail: "",
      website: "",
      logoUrl: "",
    },
  });

  useEffect(() => {
    if (!org || !isEditMode) return;
    form.reset({
      name: org.name,
      status: org.status,
      contactEmail: partner?.contactEmail ?? "",
      website: partner?.website ?? "",
      logoUrl: partner?.logoUrl ?? "",
    });
  }, [org, partner, isEditMode, form]);

  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
    }
  }, [open]);

  const handleCancel = () => {
    setIsEditMode(false);
    form.reset();
  };

  const handleSave = async (data: EditOrganisationFormData) => {
    if (!org) return;
    try {
      await updateOrganisation.mutateAsync({
        id: org.id,
        name: data.name.trim(),
        status: data.status as OrganisationStatus,
        partnerProfile: isRewardPartner
          ? {
              contactEmail: emptyToNull(data.contactEmail),
              website: emptyToNull(data.website),
              logoUrl: emptyToNull(data.logoUrl),
            }
          : undefined,
      });
      toast({
        title: "Saved",
        description: `${data.name.trim()} has been updated.`,
      });
      setIsEditMode(false);
      onOrganisationUpdate?.();
    } catch (error) {
      toast({
        title: "Update failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update organisation.",
        variant: "destructive",
      });
    }
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:w-[320px] lg:max-w-[55rem]! p-0 h-full">
        <div className="flex h-full flex-col bg-background">
          <DrawerHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-2xl font-bold">{title}</DrawerTitle>
              <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
            {!organisationId ? null : organisation.isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : organisation.isError || !org ? (
              <p className="text-sm text-destructive">
                {(organisation.error as Error)?.message ??
                  "Organisation not found."}
              </p>
            ) : isEditMode ? (
              <Form {...form}>
                <form
                  className="space-y-6"
                  onSubmit={form.handleSubmit(handleSave)}
                >
                  <Card className="border-border shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Organisation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} disabled={isLoading} />
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
                              onValueChange={field.onChange}
                              value={field.value}
                              disabled={isLoading}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">
                                  Inactive
                                </SelectItem>
                                <SelectItem value="suspended">
                                  Suspended
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  {isRewardPartner ? (
                    <Card className="border-border shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Partner Catalog Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="contactEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Email</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  {...field}
                                  disabled={isLoading}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="website"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Website</FormLabel>
                              <FormControl>
                                <Input {...field} disabled={isLoading} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="logoUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Logo URL</FormLabel>
                              <FormControl>
                                <Input {...field} disabled={isLoading} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </CardContent>
                    </Card>
                  ) : null}
                </form>
              </Form>
            ) : (
              <>
                <div className="flex items-start gap-4">
                  <Avatar className="h-20 w-20 rounded-2xl">
                    {logoUrl ? (
                      <AvatarImage
                        src={logoUrl}
                        alt={`${displayName} logo`}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-2xl bg-primary/10 text-primary text-xl font-bold">
                      {initials || <Building2 className="h-8 w-8" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {displayName}
                      </h2>
                      <CopyButton value={org.id} />
                    </div>
                    <p className="text-xs font-mono text-muted-foreground break-all">
                      {org.id}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          getOrganisationTypePresentation(org.type).badgeVariant
                        }
                      >
                        {formatOrganisationType(org.type)}
                      </Badge>
                      <Badge
                        variant={
                          getOrganisationStatusPresentation(org.status)
                            .badgeVariant
                        }
                      >
                        {formatOrganisationStatus(org.status)}
                      </Badge>
                      {partner?.status ? (
                        <Badge variant="outline">
                          Partner · {humanizeEnumToken(partner.status)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <Separator />

                {isRewardPartner ? (
                  <Card className="border-border shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">
                          {partner?.contactEmail || "No contact email"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        {partner?.website ? (
                          <a
                            href={partner.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary underline-offset-4 hover:underline break-all"
                          >
                            {partner.website}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            No website
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-border shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Organisation</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                    <DetailField label="Name" value={org.name} />
                    <DetailField
                      label="Type"
                      value={formatOrganisationType(org.type)}
                    />
                    <DetailField
                      label="Status"
                      value={formatOrganisationStatus(org.status)}
                    />
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(org.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Updated</p>
                      <p className="text-sm flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {new Date(org.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {isRewardPartner ? (
                  <Card className="border-border shadow-none">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Partner Catalog Profile
                      </CardTitle>
                      <p className="text-sm text-muted-foreground font-normal">
                        Fields from <code>reward_partner</code>, linked by
                        organisation.
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                      {partner ? (
                        <>
                          <DetailField
                            label="Partner ID"
                            value={partner.id}
                            mono
                          />
                          <DetailField
                            label="Profile Name"
                            value={partner.name}
                          />
                          <DetailField
                            label="Profile Status"
                            value={humanizeEnumToken(partner.status)}
                          />
                          <DetailField
                            label="Contact Email"
                            value={partner.contactEmail || "—"}
                          />
                          <DetailField
                            label="Website"
                            value={partner.website || "—"}
                          />
                          <DetailField
                            label="Logo URL"
                            value={partner.logoUrl || "—"}
                            mono
                          />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Profile Created
                            </p>
                            <p className="text-sm">
                              {new Date(partner.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Profile Updated
                            </p>
                            <p className="text-sm">
                              {new Date(partner.updatedAt).toLocaleString()}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground sm:col-span-2">
                          No linked reward partner profile yet. Creating or
                          syncing a catalog partner will populate this section.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-border shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Staff</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal">
                      Invite and change roles through the Platform API.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <PartnerStaffPanel
                      organisationId={org.id}
                      staff={staff.data ?? []}
                      isLoading={staff.isLoading}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {organisationId && org && !organisation.isLoading ? (
            <div className="px-6 py-4 border-t border-border flex justify-between items-center bg-background/50">
              <div className="flex gap-2">
                {isEditMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancel}
                      disabled={isLoading}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={form.handleSubmit(handleSave)}
                      disabled={isLoading}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(true)}
                    disabled={isLoading}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
              {!isEditMode ? (
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              ) : null}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
