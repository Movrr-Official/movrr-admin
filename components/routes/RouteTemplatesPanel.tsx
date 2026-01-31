"use client";

import {
  CalendarClock,
  Copy,
  MapPin,
  Route as RouteIcon,
  Ruler,
  Send,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/useToast";
import {
  mockRouteTemplates,
  RouteTemplate,
  TemplateStatus,
} from "@/data/mockRouteTemplates";
import { useRouteTemplatesData } from "@/hooks/useRouteTemplatesData";
import { useRidersData } from "@/hooks/useRidersData";
import { Rider } from "@/schemas";
import {
  createRouteTemplate,
  duplicateRouteTemplate,
  assignRouteToRiders,
} from "@/app/actions/routes";
import { shouldUseMockData } from "@/lib/dataSource";

const STATUS_STYLES: Record<TemplateStatus, string> = {
  active:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  draft:
    "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300",
  paused:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
};

const toDistanceLabel = (distanceKm: number) => `${distanceKm.toFixed(1)} km`;

const formatLastSent = (value: string) => {
  if (!value || value === "Not sent yet") {
    return "Not sent yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const getTemplateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tmpl-${Date.now()}`;
};

export function RouteTemplatesPanel() {
  const { toast } = useToast();
  const useMockData = shouldUseMockData();
  const { data: templatesData, refetch } = useRouteTemplatesData();
  const { data: ridersData, isLoading: ridersLoading } = useRidersData({
    status: "active",
  });
  const [mockTemplatesState, setMockTemplatesState] = useState<RouteTemplate[]>(
    () => mockRouteTemplates.slice(),
  );
  const templates = useMockData ? mockTemplatesState : (templatesData ?? []);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<RouteTemplate | null>(null);
  const [sendTemplate, setSendTemplate] = useState<RouteTemplate | null>(null);
  const [sendSearch, setSendSearch] = useState("");
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sendAttempted, setSendAttempted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formState, setFormState] = useState({
    name: "",
    city: "",
    zone: "",
    ridersTarget: "",
    estimatedDistanceKm: "",
    status: "draft" as TemplateStatus,
    notes: "",
  });

  const activeCount = templates.filter(
    (template) => template.status === "active",
  ).length;

  const availableRiders = useMemo(() => {
    return (ridersData ?? []).filter(
      (rider) => rider.status === "active" && !rider.currentRoute,
    );
  }, [ridersData]);

  const filteredRiders = useMemo(() => {
    const query = sendSearch.trim().toLowerCase();
    if (!query) return availableRiders;

    return availableRiders.filter(
      (rider) =>
        rider.name.toLowerCase().includes(query) ||
        rider.email.toLowerCase().includes(query),
    );
  }, [availableRiders, sendSearch]);

  const allFilteredSelected =
    filteredRiders.length > 0 &&
    filteredRiders.every((rider) => selectedRiderIds.has(rider.id));

  const selectedCount = selectedRiderIds.size;

  const validation = useMemo(() => {
    const nameValid = formState.name.trim().length >= 3;
    const cityValid = formState.city.trim().length >= 2;
    const zoneValid = formState.zone.trim().length >= 2;
    const ridersValue = Number(formState.ridersTarget);
    const ridersValid = Number.isFinite(ridersValue) && ridersValue > 0;
    const distanceValue = Number(formState.estimatedDistanceKm);
    const distanceValid = Number.isFinite(distanceValue) && distanceValue > 0;

    return {
      nameValid,
      cityValid,
      zoneValid,
      ridersValid,
      distanceValid,
      isValid:
        nameValid && cityValid && zoneValid && ridersValid && distanceValid,
    };
  }, [formState]);

  const resetForm = () => {
    setFormState({
      name: "",
      city: "",
      zone: "",
      ridersTarget: "",
      estimatedDistanceKm: "",
      status: "draft",
      notes: "",
    });
    setSubmitAttempted(false);
  };

  const resetSendState = () => {
    setSendSearch("");
    setSelectedRiderIds(new Set());
    setSendAttempted(false);
    setIsSending(false);
  };

  const handleCreateTemplate = async () => {
    setSubmitAttempted(true);
    if (!validation.isValid) return;

    const newTemplate: RouteTemplate = {
      id: getTemplateId(),
      name: formState.name.trim(),
      city: formState.city.trim(),
      zone: formState.zone.trim(),
      ridersTarget: Number(formState.ridersTarget),
      estimatedDistanceKm: Number(formState.estimatedDistanceKm),
      lastSent: "Not sent yet",
      status: formState.status,
      notes: formState.notes.trim() || undefined,
    };

    if (useMockData) {
      setMockTemplatesState((prev) => [newTemplate, ...prev]);
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Template created",
        description: `"${newTemplate.name}" is ready to be sent to riders.`,
      });
      return;
    }

    const result = await createRouteTemplate({
      name: newTemplate.name,
      city: newTemplate.city,
      zone: newTemplate.zone,
      ridersTarget: newTemplate.ridersTarget,
      estimatedDistanceKm: newTemplate.estimatedDistanceKm,
      status: newTemplate.status,
      notes: newTemplate.notes,
    });

    if (!result.success) {
      toast({
        title: "Unable to create template",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    await refetch();
    setIsDialogOpen(false);
    resetForm();
    toast({
      title: "Template created",
      description: `"${newTemplate.name}" is ready to be sent to riders.`,
    });
  };

  const handleDuplicate = async (template: RouteTemplate) => {
    const copy: RouteTemplate = {
      ...template,
      id: getTemplateId(),
      name: `${template.name} (Copy)`,
      status: "draft",
      lastSent: "Not sent yet",
    };

    if (useMockData) {
      setMockTemplatesState((prev) => [copy, ...prev]);
      toast({
        title: "Template duplicated",
        description: `Created a draft copy of "${template.name}".`,
      });
      return;
    }

    const result = await duplicateRouteTemplate({
      templateId: template.id,
      name: copy.name,
    });

    if (!result.success) {
      toast({
        title: "Unable to duplicate template",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    await refetch();
    toast({
      title: "Template duplicated",
      description: `Created a draft copy of "${template.name}".`,
    });
  };

  const handleSend = (template: RouteTemplate) => {
    setSendTemplate(template);
    resetSendState();
    setIsSendOpen(true);
  };

  const toggleRiderSelection = (riderId: string) => {
    setSelectedRiderIds((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) {
        next.delete(riderId);
      } else {
        next.add(riderId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedRiderIds((prev) => {
      if (allFilteredSelected) {
        return new Set();
      }
      const next = new Set(prev);
      filteredRiders.forEach((rider) => next.add(rider.id));
      return next;
    });
  };

  const handleConfirmSend = async () => {
    if (!sendTemplate) return;

    setSendAttempted(true);
    if (selectedRiderIds.size === 0) return;

    setIsSending(true);

    if (useMockData) {
      const nowLabel = new Date().toISOString();
      setMockTemplatesState((prev) =>
        prev.map((template) =>
          template.id === sendTemplate.id
            ? {
                ...template,
                lastSent: nowLabel,
                ridersTarget: template.ridersTarget + selectedRiderIds.size,
              }
            : template,
        ),
      );

      toast({
        title: "Route sent",
        description: `Assigned ${selectedRiderIds.size} riders to "${sendTemplate.name}".`,
      });
      setIsSendOpen(false);
      resetSendState();
      return;
    }

    const result = await assignRouteToRiders({
      routeId: sendTemplate.id,
      riderIds: Array.from(selectedRiderIds),
    });

    if (!result.success) {
      setIsSending(false);
      toast({
        title: "Unable to assign riders",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    await refetch();
    setIsSendOpen(false);
    resetSendState();

    const assignedCount = result.assignedCount ?? 0;
    const skippedCount = result.skippedCount ?? 0;
    const summary =
      skippedCount > 0
        ? `${assignedCount} assigned, ${skippedCount} already assigned.`
        : `${assignedCount} riders assigned.`;

    toast({
      title: "Route sent",
      description: summary,
    });
  };

  const handleView = (template: RouteTemplate) => {
    setSelectedTemplate(template);
    setIsViewOpen(true);
  };

  return (
    <Card className="glass-card border-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg font-bold">Route Templates</CardTitle>
          <p className="text-sm text-muted-foreground">
            Template routes to quickly dispatch standardized paths to riders.
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <RouteIcon className="h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create route template</DialogTitle>
              <DialogDescription>
                Save a reusable route that can be dispatched to riders in one
                click.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Morning Market Loop"
                  aria-invalid={submitAttempted && !validation.nameValid}
                />
                {submitAttempted && !validation.nameValid && (
                  <p className="text-xs text-destructive">
                    Name should be at least 3 characters.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="template-city">City</Label>
                  <Input
                    id="template-city"
                    value={formState.city}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        city: event.target.value,
                      }))
                    }
                    placeholder="Nairobi"
                    aria-invalid={submitAttempted && !validation.cityValid}
                  />
                  {submitAttempted && !validation.cityValid && (
                    <p className="text-xs text-destructive">
                      City is required.
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="template-zone">Zone</Label>
                  <Input
                    id="template-zone"
                    value={formState.zone}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        zone: event.target.value,
                      }))
                    }
                    placeholder="CBD"
                    aria-invalid={submitAttempted && !validation.zoneValid}
                  />
                  {submitAttempted && !validation.zoneValid && (
                    <p className="text-xs text-destructive">
                      Zone is required.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="template-riders">Target riders</Label>
                  <Input
                    id="template-riders"
                    type="number"
                    min={1}
                    value={formState.ridersTarget}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        ridersTarget: event.target.value,
                      }))
                    }
                    placeholder="12"
                    aria-invalid={submitAttempted && !validation.ridersValid}
                  />
                  {submitAttempted && !validation.ridersValid && (
                    <p className="text-xs text-destructive">
                      Add a rider count greater than 0.
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="template-distance">
                    Estimated distance (km)
                  </Label>
                  <Input
                    id="template-distance"
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={formState.estimatedDistanceKm}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        estimatedDistanceKm: event.target.value,
                      }))
                    }
                    placeholder="10.5"
                    aria-invalid={submitAttempted && !validation.distanceValid}
                  />
                  {submitAttempted && !validation.distanceValid && (
                    <p className="text-xs text-destructive">
                      Add a distance greater than 0.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: value as TemplateStatus,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="template-notes">Notes (optional)</Label>
                <Textarea
                  id="template-notes"
                  value={formState.notes}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Add rider instructions or brand-specific guidance."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={resetForm}>
                Clear
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!validation.isValid}
              >
                Create template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1">
            {templates.length} templates
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1">
            {activeCount} active
          </span>
        </div>

        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-border/40 bg-background/70 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{template.name}</h4>
                    <Badge
                      variant="outline"
                      className={`capitalize ${STATUS_STYLES[template.status]}`}
                    >
                      {template.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {template.city} • {template.zone} •{" "}
                    {toDistanceLabel(template.estimatedDistanceKm)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {template.ridersTarget} riders
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    {formatLastSent(template.lastSent)}
                  </span>
                </div>
              </div>

              <Separator className="my-3" />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicate(template)}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSend(template)}
                >
                  <Send className="h-4 w-4" />
                  Send to Riders
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleView(template)}
                >
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) {
            setSelectedTemplate(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Route template details</DialogTitle>
            <DialogDescription>
              Review template metadata before dispatching it to riders.
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedTemplate.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Template ID: {selectedTemplate.id}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`capitalize ${STATUS_STYLES[selectedTemplate.status]}`}
                >
                  {selectedTemplate.status}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Location</p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {selectedTemplate.city} • {selectedTemplate.zone}
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    {toDistanceLabel(selectedTemplate.estimatedDistanceKm)}
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Target riders</p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {selectedTemplate.ridersTarget} riders
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Last sent</p>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    {formatLastSent(selectedTemplate.lastSent)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="mt-2 text-sm font-medium">
                  {selectedTemplate.notes || "No notes added yet."}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a template to view details.
            </p>
          )}

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            {selectedTemplate && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDuplicate(selectedTemplate)}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSend(selectedTemplate)}
                >
                  <Send className="h-4 w-4" />
                  Send to Riders
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isSendOpen}
        onOpenChange={(open) => {
          setIsSendOpen(open);
          if (!open) {
            setSendTemplate(null);
            resetSendState();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send route to riders</DialogTitle>
            <DialogDescription>
              Select available riders to assign this route template.
            </DialogDescription>
          </DialogHeader>

          {sendTemplate ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/40 bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Route template</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {sendTemplate.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={`capitalize ${STATUS_STYLES[sendTemplate.status]}`}
                  >
                    {sendTemplate.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sendTemplate.city} • {sendTemplate.zone} •{" "}
                  {toDistanceLabel(sendTemplate.estimatedDistanceKm)}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={sendSearch}
                    onChange={(event) => setSendSearch(event.target.value)}
                    placeholder="Search riders by name or email"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span>Select all</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selectedCount} selected • {availableRiders.length} available
                </span>
                {ridersLoading && <span>Loading riders...</span>}
              </div>

              <ScrollArea className="h-64 rounded-lg border border-border/40">
                <div className="space-y-2 p-3">
                  {filteredRiders.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                      No available riders match your search.
                    </div>
                  ) : (
                    filteredRiders.map((rider: Rider) => (
                      <button
                        key={rider.id}
                        type="button"
                        onClick={() => toggleRiderSelection(rider.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/70 p-3 text-left transition hover:border-primary/50 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedRiderIds.has(rider.id)}
                            onClick={(event) => event.stopPropagation()}
                            onCheckedChange={() =>
                              toggleRiderSelection(rider.id)
                            }
                          />
                          <div>
                            <p className="text-sm font-medium">{rider.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {rider.email}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p className="capitalize">
                            {rider.vehicle?.type ?? "bike"}
                          </p>
                          <p>Rating {rider.rating.toFixed(1)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              {sendAttempted && selectedCount === 0 && (
                <p className="text-xs text-destructive">
                  Select at least one rider to send the route.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a route template to dispatch.
            </p>
          )}

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <DialogClose asChild>
              <Button variant="ghost" disabled={isSending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="secondary"
              onClick={handleConfirmSend}
              disabled={
                !sendTemplate ||
                ridersLoading ||
                selectedCount === 0 ||
                isSending
              }
            >
              <Send className="h-4 w-4" />
              {isSending ? "Sending..." : "Send to Riders"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
