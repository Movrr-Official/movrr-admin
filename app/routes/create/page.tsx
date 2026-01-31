"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowLeft, MapPin, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/useToast";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { createRoute, createRouteStops } from "@/app/actions/routes";
import {
  upsertCampaignHotZone,
  upsertCampaignZone,
} from "@/app/actions/campaigns";
import { shouldUseMockData } from "@/lib/dataSource";

const requiredNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => Number(value), schema);

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return Number(value);
  }, schema.optional());

const routeFormSchema = z.object({
  name: z.string().min(3, "Route name must be at least 3 characters."),
  description: z.string().optional(),
  campaignId: z.string().optional(),
  status: z.enum(["pending", "active", "paused", "completed", "cancelled"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  city: z.string().min(2, "City is required."),
  country: z.string().optional(),
  startLat: requiredNumber(z.number().min(-90).max(90)),
  startLng: requiredNumber(z.number().min(-180).max(180)),
  endLat: requiredNumber(z.number().min(-90).max(90)),
  endLng: requiredNumber(z.number().min(-180).max(180)),
  estimatedDurationMinutes: optionalNumber(z.number().int().min(0)),
  coverageKm: optionalNumber(z.number().min(0)),
  tolerance: optionalNumber(z.number().min(0).max(100)),
});

type RouteFormValues = z.infer<typeof routeFormSchema>;

type StrategicStop = {
  id: string;
  name: string;
  lat: string;
  lng: string;
  notes: string;
};

type CampaignZoneEntry = {
  id: string;
  name: string;
  geojson: string;
};

type HotZoneEntry = {
  id: string;
  name: string;
  geojson: string;
  bonusPercent: string;
  startsAt: string;
  endsAt: string;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parseGeoJson = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return { error: "GeoJSON must be an object." };
    }
    if (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon") {
      return { error: "GeoJSON type must be Polygon or MultiPolygon." };
    }
    if (!Array.isArray(parsed.coordinates)) {
      return { error: "GeoJSON coordinates must be an array." };
    }
    return { value: parsed };
  } catch {
    return { error: "GeoJSON must be valid JSON." };
  }
};

const toIsoString = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

export default function CreateRoutePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: campaigns } = useCampaignsData();
  const useMockData = shouldUseMockData();

  const form = useForm<RouteFormValues>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      name: "",
      description: "",
      campaignId: "",
      status: "pending",
      difficulty: "easy",
      city: "",
      country: "",
      startLat: undefined,
      startLng: undefined,
      endLat: undefined,
      endLng: undefined,
      estimatedDurationMinutes: undefined,
      coverageKm: undefined,
      tolerance: undefined,
    },
  });

  const [strategicStops, setStrategicStops] = useState<StrategicStop[]>([]);
  const [campaignZones, setCampaignZones] = useState<CampaignZoneEntry[]>([]);
  const [hotZones, setHotZones] = useState<HotZoneEntry[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({});
  const [hotZoneErrors, setHotZoneErrors] = useState<Record<string, string>>(
    {},
  );
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({});
  const [campaignError, setCampaignError] = useState("");

  const campaignOptions = useMemo(() => {
    return (campaigns ?? []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    }));
  }, [campaigns]);

  const addStrategicStop = () => {
    setStrategicStops((prev) => [
      ...prev,
      { id: createId(), name: "", lat: "", lng: "", notes: "" },
    ]);
  };

  const addCampaignZone = () => {
    setCampaignZones((prev) => [
      ...prev,
      { id: createId(), name: "", geojson: "" },
    ]);
  };

  const addHotZone = () => {
    setHotZones((prev) => [
      ...prev,
      {
        id: createId(),
        name: "",
        geojson: "",
        bonusPercent: "0",
        startsAt: "",
        endsAt: "",
      },
    ]);
  };

  const validateStops = () => {
    const errors: Record<string, string> = {};
    strategicStops.forEach((stop) => {
      const lat = Number(stop.lat);
      const lng = Number(stop.lng);
      if (!stop.name.trim()) {
        errors[stop.id] = "Stop name is required.";
        return;
      }
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors[stop.id] = "Latitude must be between -90 and 90.";
        return;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors[stop.id] = "Longitude must be between -180 and 180.";
      }
    });
    setStopErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateZones = () => {
    const errors: Record<string, string> = {};
    campaignZones.forEach((zone) => {
      if (!zone.name.trim()) {
        errors[zone.id] = "Zone name is required.";
        return;
      }
      const parsed = parseGeoJson(zone.geojson);
      if (parsed.error) {
        errors[zone.id] = parsed.error;
      }
    });
    setZoneErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateHotZones = () => {
    const errors: Record<string, string> = {};
    hotZones.forEach((zone) => {
      if (!zone.name.trim()) {
        errors[zone.id] = "Hot zone name is required.";
        return;
      }
      const parsed = parseGeoJson(zone.geojson);
      if (parsed.error) {
        errors[zone.id] = parsed.error;
        return;
      }
      const bonus = Number(zone.bonusPercent);
      if (!Number.isFinite(bonus) || bonus < 0 || bonus > 100) {
        errors[zone.id] = "Bonus percent must be between 0 and 100.";
      }
    });
    setHotZoneErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (values: RouteFormValues) => {
    setSubmitAttempted(true);
    setCampaignError("");

    const stopsValid = validateStops();
    const zonesValid = validateZones();
    const hotZonesValid = validateHotZones();

    if (
      (campaignZones.length > 0 || hotZones.length > 0) &&
      !values.campaignId
    ) {
      setCampaignError("Select a campaign to attach zones.");
      return;
    }

    if (!stopsValid || !zonesValid || !hotZonesValid) return;

    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Route creation is disabled while mock data is enabled.",
      });
      return;
    }

    setIsSubmitting(true);

    const createResult = await createRoute({
      name: values.name,
      description: values.description,
      campaignId: values.campaignId || null,
      startLat: values.startLat,
      startLng: values.startLng,
      endLat: values.endLat,
      endLng: values.endLng,
      estimatedDurationMinutes: values.estimatedDurationMinutes,
      coverageKm: values.coverageKm,
      city: values.city,
      country: values.country,
      difficulty: values.difficulty,
      status: values.status,
      tolerance: values.tolerance,
    });

    if (!createResult.success || !createResult.data?.id) {
      setIsSubmitting(false);
      toast({
        title: "Unable to create route",
        description: createResult.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    const routeId = createResult.data.id as string;

    if (strategicStops.length > 0) {
      const stopsPayload = strategicStops.map((stop, index) => ({
        name: stop.name.trim(),
        lat: Number(stop.lat),
        lng: Number(stop.lng),
        order: index,
        notes: stop.notes.trim() || undefined,
      }));

      const stopResult = await createRouteStops({
        routeId,
        stops: stopsPayload,
      });

      if (!stopResult.success) {
        setIsSubmitting(false);
        toast({
          title: "Route created with warnings",
          description: stopResult.error ?? "Stops were not saved.",
          variant: "destructive",
        });
        return;
      }
    }

    if (values.campaignId && campaignZones.length > 0) {
      for (const zone of campaignZones) {
        const parsed = parseGeoJson(zone.geojson);
        if (!parsed.value) continue;
        const zoneResult = await upsertCampaignZone({
          campaignId: values.campaignId,
          name: zone.name,
          geom: parsed.value,
        });
        if (!zoneResult.success) {
          setIsSubmitting(false);
          toast({
            title: "Route created with warnings",
            description: zoneResult.error ?? "Failed to save campaign zone.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (values.campaignId && hotZones.length > 0) {
      for (const zone of hotZones) {
        const parsed = parseGeoJson(zone.geojson);
        if (!parsed.value) continue;
        const hotZoneResult = await upsertCampaignHotZone({
          campaignId: values.campaignId,
          name: zone.name,
          bonusPercent: Number(zone.bonusPercent),
          startsAt: toIsoString(zone.startsAt),
          endsAt: toIsoString(zone.endsAt),
          geom: parsed.value,
        });
        if (!hotZoneResult.success) {
          setIsSubmitting(false);
          toast({
            title: "Route created with warnings",
            description: hotZoneResult.error ?? "Failed to save hot zone.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    toast({
      title: "Route created",
      description: "The new route template is ready to assign to riders.",
    });

    router.push("/routes");
    router.refresh();
  };

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Create Route"
          description="Build a new route template with zones, hot zones, and strategic stops."
          action={{
            label: "Back to Routes",
            href: "/routes",
            icon: <ArrowLeft className="h-4 w-4" />,
            asChild: true,
          }}
        />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>Core Route Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Route name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Morning Market Loop" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="campaignId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value || "none"}
                            onValueChange={(value) =>
                              field.onChange(value === "none" ? "" : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select campaign" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No campaign</SelectItem>
                              {campaignOptions.map((campaign) => (
                                <SelectItem
                                  key={campaign.id}
                                  value={campaign.id}
                                >
                                  {campaign.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        {campaignError && (
                          <p className="text-xs text-destructive">
                            {campaignError}
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Route description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Outline route objectives, rider guidance, or brand requirements."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="paused">Paused</SelectItem>
                              <SelectItem value="completed">
                                Completed
                              </SelectItem>
                              <SelectItem value="cancelled">
                                Cancelled
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="difficulty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Difficulty</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select difficulty" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="easy">Easy</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="estimatedDurationMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Est. duration (min)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              placeholder="45"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="coverageKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Coverage (km)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              step={0.1}
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              placeholder="12.5"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nairobi" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Kenya" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tolerance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Compliance tolerance (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="10"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle>Route Coordinates</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start latitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={0.0001}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="-1.286389"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="startLng"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start longitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={0.0001}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="36.817223"
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
                    name="endLat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End latitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={0.0001}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="-1.292066"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endLng"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End longitude</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step={0.0001}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="36.821945"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Strategic Stops</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStrategicStop}
                >
                  <Plus className="h-4 w-4" />
                  Add Stop
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {strategicStops.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Add mid-route checkpoints to track rider compliance.
                  </div>
                ) : (
                  strategicStops.map((stop, index) => (
                    <div
                      key={stop.id}
                      className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold">
                            Stop {index + 1}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setStrategicStops((prev) =>
                              prev.filter((item) => item.id !== stop.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          value={stop.name}
                          onChange={(event) =>
                            setStrategicStops((prev) =>
                              prev.map((item) =>
                                item.id === stop.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Stop name"
                        />
                        <Input
                          type="number"
                          step={0.0001}
                          value={stop.lat}
                          onChange={(event) =>
                            setStrategicStops((prev) =>
                              prev.map((item) =>
                                item.id === stop.id
                                  ? { ...item, lat: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Latitude"
                        />
                        <Input
                          type="number"
                          step={0.0001}
                          value={stop.lng}
                          onChange={(event) =>
                            setStrategicStops((prev) =>
                              prev.map((item) =>
                                item.id === stop.id
                                  ? { ...item, lng: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Longitude"
                        />
                      </div>
                      <Textarea
                        value={stop.notes}
                        onChange={(event) =>
                          setStrategicStops((prev) =>
                            prev.map((item) =>
                              item.id === stop.id
                                ? { ...item, notes: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Notes for riders (optional)"
                      />
                      {submitAttempted && stopErrors[stop.id] && (
                        <p className="text-xs text-destructive">
                          {stopErrors[stop.id]}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Campaign Zones</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCampaignZone}
                >
                  <Plus className="h-4 w-4" />
                  Add Zone
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaignZones.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Attach GeoJSON polygons that define the campaign coverage
                    area.
                  </div>
                ) : (
                  campaignZones.map((zone) => (
                    <div
                      key={zone.id}
                      className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Input
                          value={zone.name}
                          onChange={(event) =>
                            setCampaignZones((prev) =>
                              prev.map((item) =>
                                item.id === zone.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Zone name"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setCampaignZones((prev) =>
                              prev.filter((item) => item.id !== zone.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={zone.geojson}
                        onChange={(event) =>
                          setCampaignZones((prev) =>
                            prev.map((item) =>
                              item.id === zone.id
                                ? { ...item, geojson: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder='{"type":"Polygon","coordinates":[[[36.8,-1.28],[36.9,-1.28],[36.9,-1.3],[36.8,-1.3],[36.8,-1.28]]]}'
                      />
                      {submitAttempted && zoneErrors[zone.id] && (
                        <p className="text-xs text-destructive">
                          {zoneErrors[zone.id]}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Hot Zones</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addHotZone}
                >
                  <Plus className="h-4 w-4" />
                  Add Hot Zone
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {hotZones.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Highlight bonus zones with higher rider incentives.
                  </div>
                ) : (
                  hotZones.map((zone) => (
                    <div
                      key={zone.id}
                      className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Input
                          value={zone.name}
                          onChange={(event) =>
                            setHotZones((prev) =>
                              prev.map((item) =>
                                item.id === zone.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Hot zone name"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setHotZones((prev) =>
                              prev.filter((item) => item.id !== zone.id),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={zone.bonusPercent}
                          onChange={(event) =>
                            setHotZones((prev) =>
                              prev.map((item) =>
                                item.id === zone.id
                                  ? {
                                      ...item,
                                      bonusPercent: event.target.value,
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Bonus %"
                        />
                        <Input
                          type="datetime-local"
                          value={zone.startsAt}
                          onChange={(event) =>
                            setHotZones((prev) =>
                              prev.map((item) =>
                                item.id === zone.id
                                  ? { ...item, startsAt: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Input
                          type="datetime-local"
                          value={zone.endsAt}
                          onChange={(event) =>
                            setHotZones((prev) =>
                              prev.map((item) =>
                                item.id === zone.id
                                  ? { ...item, endsAt: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <Textarea
                        value={zone.geojson}
                        onChange={(event) =>
                          setHotZones((prev) =>
                            prev.map((item) =>
                              item.id === zone.id
                                ? { ...item, geojson: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder='{"type":"Polygon","coordinates":[[[36.8,-1.28],[36.9,-1.28],[36.9,-1.3],[36.8,-1.3],[36.8,-1.28]]]}'
                      />
                      {submitAttempted && hotZoneErrors[zone.id] && (
                        <p className="text-xs text-destructive">
                          {hotZoneErrors[zone.id]}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Separator />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="ghost" asChild>
                <Link href="/routes">Cancel</Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{strategicStops.length} stops</Badge>
                <Badge variant="outline">{campaignZones.length} zones</Badge>
                <Badge variant="outline">{hotZones.length} hot zones</Badge>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Route"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
