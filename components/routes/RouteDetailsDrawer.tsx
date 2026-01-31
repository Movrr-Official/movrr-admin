"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  User,
  Route,
  Download,
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertCircle,
  Target,
  Coins,
  History,
  Navigation,
  FileText,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiderRoute } from "@/schemas";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import { RouteTrackingMap } from "@/components/routes/RouteTrackingMap";
import {
  approveRoute,
  rejectRoute,
  recalculateRouteCompliance,
  getRouteGPSTracking,
  getRouteComplianceBreakdown,
  getRoutePointsAwarded,
  getRouteTimeline,
  exportRouteData,
  updateRoute,
  getRouteStops,
  upsertRouteStop,
  deleteRouteStop,
  unassignRouteAssignment,
} from "@/app/actions/routes";
import { exportToJSON } from "@/lib/export";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteCampaignHotZone,
  deleteCampaignZone,
  getCampaignHotZones,
  getCampaignZones,
  upsertCampaignHotZone,
  upsertCampaignZone,
} from "@/app/actions/campaigns";
import { useCampaignsData } from "@/hooks/useCampaignsData";
import { shouldUseMockData } from "@/lib/dataSource";

interface RouteDetailsDrawerProps {
  route: RiderRoute | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRouteUpdate?: () => void;
}

type RouteStopEntry = {
  id: string;
  name: string;
  lat: string;
  lng: string;
  notes: string;
  order: number;
  isNew?: boolean;
};

type CampaignZoneEntry = {
  id: string;
  name: string;
  geojson: string;
  isNew?: boolean;
};

type HotZoneEntry = {
  id: string;
  name: string;
  geojson: string;
  bonusPercent: string;
  startsAt: string;
  endsAt: string;
  isNew?: boolean;
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

const toDateTimeLocal = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
};

export function RouteDetailsDrawer({
  route,
  open,
  onOpenChange,
  onRouteUpdate,
}: RouteDetailsDrawerProps) {
  const { toast } = useToast();
  const { data: campaigns } = useCampaignsData();
  const useMockData = shouldUseMockData();
  const [isLoading, setIsLoading] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showRecalculateDialog, setShowRecalculateDialog] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isExportingData, setIsExportingData] = useState(false);
  const [gpsTracking, setGpsTracking] = useState<any[]>([]);
  const [complianceBreakdown, setComplianceBreakdown] = useState<any>(null);
  const [pointsAwarded, setPointsAwarded] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoadingAdditionalData, setIsLoadingAdditionalData] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSavingRoute, setIsSavingRoute] = useState(false);
  const [isSavingZones, setIsSavingZones] = useState(false);
  const [isSavingStops, setIsSavingStops] = useState(false);
  const [routeForm, setRouteForm] = useState({
    name: "",
    description: "",
    status: "pending",
    difficulty: "easy",
    city: "",
    country: "",
    startLat: "",
    startLng: "",
    endLat: "",
    endLng: "",
    estimatedDurationMinutes: "",
    coverageKm: "",
    tolerance: "",
  });
  const [campaignId, setCampaignId] = useState("");
  const [routeStops, setRouteStops] = useState<RouteStopEntry[]>([]);
  const [campaignZones, setCampaignZones] = useState<CampaignZoneEntry[]>([]);
  const [hotZones, setHotZones] = useState<HotZoneEntry[]>([]);
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({});
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({});
  const [hotZoneErrors, setHotZoneErrors] = useState<Record<string, string>>(
    {},
  );
  const [routeErrors, setRouteErrors] = useState<Record<string, string>>({});

  const campaignOptions = useMemo(() => {
    return (campaigns ?? []).map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
    }));
  }, [campaigns]);

  // Load additional data when drawer opens
  useEffect(() => {
    if (open && route) {
      loadAdditionalData();
      hydrateRouteForm(route);
      setRouteStops([]);
      setCampaignZones([]);
      setHotZones([]);
    } else {
      // Reset state when drawer closes
      setGpsTracking([]);
      setComplianceBreakdown(null);
      setPointsAwarded(null);
      setTimeline([]);
      setRejectionReason("");
      setRouteErrors({});
      setStopErrors({});
      setZoneErrors({});
      setHotZoneErrors({});
    }
  }, [open, route]);

  useEffect(() => {
    if (open && route && activeTab === "manage") {
      loadManagementData(route);
    }
  }, [activeTab, open, route, campaignId]);

  const loadAdditionalData = async () => {
    if (!route) return;
    const routeTemplateId = route.routeId ?? route.id;

    setIsLoadingAdditionalData(true);
    try {
      const [gpsResult, complianceResult, pointsResult, timelineResult] =
        await Promise.all([
          getRouteGPSTracking(routeTemplateId),
          getRouteComplianceBreakdown(route.id),
          getRoutePointsAwarded(routeTemplateId),
          getRouteTimeline(route.id),
        ]);

      if (gpsResult.success) setGpsTracking(gpsResult.data || []);
      if (complianceResult.success)
        setComplianceBreakdown(complianceResult.data);
      if (pointsResult.success) setPointsAwarded(pointsResult.data);
      if (timelineResult.success) setTimeline(timelineResult.data || []);
    } catch (error) {
      console.error("Error loading additional route data:", error);
    } finally {
      setIsLoadingAdditionalData(false);
    }
  };

  const hydrateRouteForm = (currentRoute: RiderRoute) => {
    const difficulty = currentRoute.difficulty?.toLowerCase() ?? "easy";
    const templateStatus = currentRoute.templateStatus ?? "pending";
    setRouteForm({
      name: currentRoute.name ?? "",
      description: currentRoute.description ?? "",
      status: templateStatus,
      difficulty: ["easy", "medium", "hard"].includes(difficulty)
        ? difficulty
        : "easy",
      city: currentRoute.city ?? "",
      country: currentRoute.country ?? "",
      startLat:
        currentRoute.startLat !== undefined
          ? String(currentRoute.startLat)
          : "",
      startLng:
        currentRoute.startLng !== undefined
          ? String(currentRoute.startLng)
          : "",
      endLat:
        currentRoute.endLat !== undefined ? String(currentRoute.endLat) : "",
      endLng:
        currentRoute.endLng !== undefined ? String(currentRoute.endLng) : "",
      estimatedDurationMinutes:
        currentRoute.estimatedDurationMinutes !== undefined
          ? String(currentRoute.estimatedDurationMinutes)
          : "",
      coverageKm:
        currentRoute.coverageKm !== undefined
          ? String(currentRoute.coverageKm)
          : "",
      tolerance:
        currentRoute.tolerance !== undefined
          ? String(currentRoute.tolerance)
          : "",
    });
    setCampaignId(
      currentRoute.campaignIdPrimary ?? currentRoute.campaignId?.[0] ?? "",
    );
  };

  const loadManagementData = async (currentRoute: RiderRoute) => {
    if (useMockData) return;

    const routeTemplateId = currentRoute.routeId ?? currentRoute.id;

    try {
      if (routeTemplateId) {
        const stopsResult = await getRouteStops(routeTemplateId);
        if (stopsResult.success && stopsResult.data) {
          setRouteStops(
            stopsResult.data.map((stop) => ({
              id: stop.id,
              name: stop.name,
              lat: String(stop.lat),
              lng: String(stop.lng),
              notes: stop.notes ?? "",
              order: stop.order,
            })),
          );
        }
      }

      if (campaignId) {
        const zonesResult = await getCampaignZones(campaignId);
        const zoneData = (zonesResult?.data ?? []).map((zone: any) => ({
          id: zone.id,
          name: zone.name ?? "",
          geojson: zone.geom ? JSON.stringify(zone.geom) : "",
        }));
        setCampaignZones(zoneData);

        const hotZonesResult = await getCampaignHotZones(campaignId);
        const hotZoneData = (hotZonesResult?.data ?? []).map((zone: any) => ({
          id: zone.id,
          name: zone.name ?? "",
          geojson: zone.geom ? JSON.stringify(zone.geom) : "",
          bonusPercent: String(zone.bonus_percent ?? 0),
          startsAt: toDateTimeLocal(zone.starts_at),
          endsAt: toDateTimeLocal(zone.ends_at),
        }));
        setHotZones(hotZoneData);
      }
    } catch (error) {
      console.error("Load route management data error:", error);
    }
  };

  const parseNumberValue = (value: string) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const validateRouteForm = () => {
    const errors: Record<string, string> = {};
    if (!routeForm.name.trim() || routeForm.name.trim().length < 3) {
      errors.name = "Route name must be at least 3 characters.";
    }
    if (!routeForm.city.trim()) {
      errors.city = "City is required.";
    }

    const startLat = parseNumberValue(routeForm.startLat);
    const startLng = parseNumberValue(routeForm.startLng);
    const endLat = parseNumberValue(routeForm.endLat);
    const endLng = parseNumberValue(routeForm.endLng);

    if (startLat === undefined || startLat < -90 || startLat > 90) {
      errors.startLat = "Start latitude must be between -90 and 90.";
    }
    if (startLng === undefined || startLng < -180 || startLng > 180) {
      errors.startLng = "Start longitude must be between -180 and 180.";
    }
    if (endLat === undefined || endLat < -90 || endLat > 90) {
      errors.endLat = "End latitude must be between -90 and 90.";
    }
    if (endLng === undefined || endLng < -180 || endLng > 180) {
      errors.endLng = "End longitude must be between -180 and 180.";
    }

    setRouteErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStops = () => {
    const errors: Record<string, string> = {};
    routeStops.forEach((stop) => {
      const lat = parseNumberValue(stop.lat);
      const lng = parseNumberValue(stop.lng);
      if (!stop.name.trim()) {
        errors[stop.id] = "Stop name is required.";
        return;
      }
      if (lat === undefined || lat < -90 || lat > 90) {
        errors[stop.id] = "Latitude must be between -90 and 90.";
        return;
      }
      if (lng === undefined || lng < -180 || lng > 180) {
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

  const handleSaveRoute = async () => {
    if (!route) return;
    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Route editing is disabled while mock data is enabled.",
      });
      return;
    }

    if (!validateRouteForm()) return;

    const routeTemplateId = route.routeId ?? route.id;
    if (!routeTemplateId) return;

    setIsSavingRoute(true);
    const result = await updateRoute({
      id: routeTemplateId,
      name: routeForm.name.trim(),
      description: routeForm.description.trim() || undefined,
      campaignId: campaignId || null,
      status: routeForm.status as any,
      difficulty: routeForm.difficulty as any,
      city: routeForm.city.trim(),
      country: routeForm.country.trim() || undefined,
      startLat: parseNumberValue(routeForm.startLat),
      startLng: parseNumberValue(routeForm.startLng),
      endLat: parseNumberValue(routeForm.endLat),
      endLng: parseNumberValue(routeForm.endLng),
      estimatedDurationMinutes: parseNumberValue(
        routeForm.estimatedDurationMinutes,
      ),
      coverageKm: parseNumberValue(routeForm.coverageKm),
      tolerance: parseNumberValue(routeForm.tolerance),
    });

    setIsSavingRoute(false);

    if (!result.success) {
      toast({
        title: "Update failed",
        description: result.error ?? "Unable to update route.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Route updated",
      description: "Route details were saved successfully.",
    });
    onRouteUpdate?.();
  };

  const handleSaveStops = async () => {
    if (!route) return;
    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Stop management is disabled while mock data is enabled.",
      });
      return;
    }

    if (!validateStops()) return;

    const routeTemplateId = route.routeId ?? route.id;
    if (!routeTemplateId) return;

    setIsSavingStops(true);
    for (let index = 0; index < routeStops.length; index += 1) {
      const stop = routeStops[index];
      const result = await upsertRouteStop({
        id: stop.isNew ? undefined : stop.id,
        routeId: routeTemplateId,
        name: stop.name.trim(),
        lat: Number(stop.lat),
        lng: Number(stop.lng),
        order: index,
        notes: stop.notes.trim() || undefined,
      });

      if (!result.success) {
        setIsSavingStops(false);
        toast({
          title: "Unable to save stops",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSavingStops(false);
    toast({
      title: "Stops updated",
      description: "Strategic stops saved successfully.",
    });
    onRouteUpdate?.();
  };

  const handleSaveZones = async () => {
    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Zone management is disabled while mock data is enabled.",
      });
      return;
    }

    if (!campaignId) {
      toast({
        title: "Campaign required",
        description: "Select a campaign before saving zones.",
        variant: "destructive",
      });
      return;
    }

    if (!validateZones() || !validateHotZones()) return;

    setIsSavingZones(true);

    for (const zone of campaignZones) {
      const parsed = parseGeoJson(zone.geojson);
      if (!parsed.value) continue;
      const result = await upsertCampaignZone({
        id: zone.isNew ? undefined : zone.id,
        campaignId,
        name: zone.name.trim(),
        geom: parsed.value,
      });
      if (!result.success) {
        setIsSavingZones(false);
        toast({
          title: "Unable to save zones",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    for (const zone of hotZones) {
      const parsed = parseGeoJson(zone.geojson);
      if (!parsed.value) continue;
      const result = await upsertCampaignHotZone({
        id: zone.isNew ? undefined : zone.id,
        campaignId,
        name: zone.name.trim(),
        bonusPercent: Number(zone.bonusPercent),
        startsAt: toIsoString(zone.startsAt),
        endsAt: toIsoString(zone.endsAt),
        geom: parsed.value,
      });
      if (!result.success) {
        setIsSavingZones(false);
        toast({
          title: "Unable to save hot zones",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSavingZones(false);
    toast({
      title: "Zones updated",
      description: "Campaign zones and hot zones saved successfully.",
    });
    onRouteUpdate?.();
  };

  const handleDeleteStop = async (stop: RouteStopEntry) => {
    if (stop.isNew) {
      setRouteStops((prev) => prev.filter((item) => item.id !== stop.id));
      return;
    }
    if (useMockData) return;
    const result = await deleteRouteStop({ stopId: stop.id });
    if (!result.success) {
      toast({
        title: "Unable to delete stop",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setRouteStops((prev) => prev.filter((item) => item.id !== stop.id));
  };

  const handleDeleteZone = async (zone: CampaignZoneEntry) => {
    if (zone.isNew) {
      setCampaignZones((prev) => prev.filter((item) => item.id !== zone.id));
      return;
    }
    if (useMockData) return;
    const result = await deleteCampaignZone(zone.id);
    if (!result.success) {
      toast({
        title: "Unable to delete zone",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setCampaignZones((prev) => prev.filter((item) => item.id !== zone.id));
  };

  const handleDeleteHotZone = async (zone: HotZoneEntry) => {
    if (zone.isNew) {
      setHotZones((prev) => prev.filter((item) => item.id !== zone.id));
      return;
    }
    if (useMockData) return;
    const result = await deleteCampaignHotZone(zone.id);
    if (!result.success) {
      toast({
        title: "Unable to delete hot zone",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }
    setHotZones((prev) => prev.filter((item) => item.id !== zone.id));
  };

  const handleUnassignRoute = async () => {
    if (!route) return;
    if (useMockData) {
      toast({
        title: "Mock mode",
        description: "Unassigning routes is disabled in mock mode.",
      });
      return;
    }

    setIsLoading(true);
    const result = await unassignRouteAssignment({ riderRouteId: route.id });
    setIsLoading(false);

    if (!result.success) {
      toast({
        title: "Unassign failed",
        description: result.error ?? "Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Route unassigned",
      description: "The route assignment has been cancelled.",
    });
    setShowUnassignDialog(false);
    onRouteUpdate?.();
  };

  const addRouteStop = () => {
    setRouteStops((prev) => [
      ...prev,
      {
        id: createId(),
        name: "",
        lat: "",
        lng: "",
        notes: "",
        order: prev.length,
        isNew: true,
      },
    ]);
  };

  const addCampaignZone = () => {
    setCampaignZones((prev) => [
      ...prev,
      { id: createId(), name: "", geojson: "", isNew: true },
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
        isNew: true,
      },
    ]);
  };

  const handleApprove = async () => {
    if (!route) return;

    setIsLoading(true);
    try {
      const result = await approveRoute(route.id);

      if (!result.success) {
        throw new Error(result.error || "Failed to approve route");
      }

      toast({
        title: "Route Approved",
        description: `Route "${route.name}" has been approved successfully.`,
      });

      setShowApproveDialog(false);
      onRouteUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Approval Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to approve route. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!route) return;

    setIsLoading(true);
    try {
      const result = await rejectRoute(route.id, rejectionReason);

      if (!result.success) {
        throw new Error(result.error || "Failed to reject route");
      }

      toast({
        title: "Route Rejected",
        description: `Route "${route.name}" has been rejected.`,
      });

      setShowRejectDialog(false);
      setRejectionReason("");
      onRouteUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Rejection Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to reject route. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculateCompliance = async () => {
    if (!route) return;

    setIsLoading(true);
    try {
      const result = await recalculateRouteCompliance({ routeId: route.id });

      if (!result.success) {
        throw new Error(result.error || "Failed to recalculate compliance");
      }

      toast({
        title: "Compliance Recalculated",
        description: `New compliance score: ${result.compliance}%`,
      });

      setShowRecalculateDialog(false);
      onRouteUpdate?.();
      // Reload compliance breakdown
      const complianceResult = await getRouteComplianceBreakdown(route.id);
      if (complianceResult.success) {
        setComplianceBreakdown(complianceResult.data);
      }
    } catch (error) {
      toast({
        title: "Recalculation Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to recalculate compliance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!route) return;

    setIsExportingData(true);
    try {
      const result = await exportRouteData({ routeId: route.id });

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to export route data");
      }

      exportToJSON([result.data], {
        filename: `route_data_${route.id}_${new Date().toISOString().split("T")[0]}`,
        format: "json",
      });

      toast({
        title: "Export Complete",
        description: `Route data for "${route.name}" has been exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to export route data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingData(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "assigned":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300">
            <Calendar className="h-3 w-3 mr-1" />
            Assigned
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300">
            <Clock className="h-3 w-3 mr-1" />
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPerformanceBadge = (performance: string) => {
    switch (performance) {
      case "high":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
            <TrendingUp className="h-3 w-3 mr-1" />
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="h-3 w-3 mr-1" />
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300">
            <AlertCircle className="h-3 w-3 mr-1" />
            Low
          </Badge>
        );
      default:
        return <Badge variant="secondary">{performance}</Badge>;
    }
  };

  if (!route) return null;

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="glass-card border-0 backdrop-blur-xl h-full w-full sm:w-[360px] lg:max-w-[60rem]! p-0">
          <DrawerHeader className="border-b border-border/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <DrawerTitle className="text-2xl font-bold mb-2">
                  {route.name}
                </DrawerTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(route.status)}
                  {getPerformanceBadge(route.performance)}
                  {route.brand && (
                    <Badge variant="outline" className="font-medium">
                      {route.brand}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("manage")}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerHeader>

          <div className="overflow-y-auto flex-1 p-6">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="gps">GPS Tracking</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="points">Points</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="manage">Manage</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Route Information */}
                  <Card className="glass-card border-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Route className="h-5 w-5" />
                        Route Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Route ID
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono">{route.id}</span>
                          <CopyButton value={route.id} />
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Start Location
                        </span>
                        <span className="text-sm font-medium">
                          {route.startLocation}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          End Location
                        </span>
                        <span className="text-sm font-medium">
                          {route.endLocation}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          City
                        </span>
                        <span className="text-sm font-medium">
                          {route.city}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Zone
                        </span>
                        <span className="text-sm font-medium">
                          {route.zone}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Estimated Duration
                        </span>
                        <span className="text-sm font-medium">
                          {route.estimatedDuration}
                        </span>
                      </div>
                      {route.completionTime && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Actual Duration
                          </span>
                          <span className="text-sm font-medium">
                            {route.completionTime} minutes
                          </span>
                        </div>
                      )}
                      {route.coverage !== undefined && (
                        <>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Coverage
                            </span>
                            <span className="text-sm font-medium">
                              {route.coverage}%
                            </span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Assigned Rider */}
                  <Card className="glass-card border-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Assigned Rider
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {route.assignedRiderId &&
                      route.assignedRiderId.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Riders Assigned
                            </span>
                            <span className="text-sm font-medium">
                              {route.assignedRiderId.length} rider(s)
                            </span>
                          </div>
                          <Separator />
                          <div className="space-y-2">
                            {route.assignedRiderId.map((riderId, index) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                              >
                                <span className="text-sm font-mono">
                                  {riderId || "Unknown"}
                                </span>
                                <CopyButton value={riderId || ""} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No rider assigned
                        </p>
                      )}
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Assigned Date
                        </span>
                        <span className="text-sm font-medium">
                          {route.assignedDate
                            ? format(
                                new Date(route.assignedDate),
                                "MMM d, yyyy",
                              )
                            : "—"}
                        </span>
                      </div>
                      {route.startedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Started At
                          </span>
                          <span className="text-sm font-medium">
                            {format(
                              new Date(route.startedAt),
                              "MMM d, yyyy HH:mm",
                            )}
                          </span>
                        </div>
                      )}
                      {route.completedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Completed At
                          </span>
                          <span className="text-sm font-medium">
                            {format(
                              new Date(route.completedAt),
                              "MMM d, yyyy HH:mm",
                            )}
                          </span>
                        </div>
                      )}
                      {route.cancelledAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Cancelled At
                          </span>
                          <span className="text-sm font-medium">
                            {format(
                              new Date(route.cancelledAt),
                              "MMM d, yyyy HH:mm",
                            )}
                          </span>
                        </div>
                      )}
                      {route.cancellationReason && (
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-muted-foreground">
                            Cancellation Reason
                          </span>
                          <span className="text-sm font-medium">
                            {route.cancellationReason}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Waypoints */}
                {route.waypoints && route.waypoints.length > 0 && (
                  <Card className="glass-card border-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Waypoints ({route.waypoints.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {route.waypoints
                          .sort((a, b) => a.order - b.order)
                          .map((waypoint, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold">
                                {waypoint.order + 1}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {waypoint.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {waypoint.lat.toFixed(6)},{" "}
                                  {waypoint.lng.toFixed(6)}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* GPS Tracking Tab */}
              <TabsContent value="gps" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Navigation className="h-5 w-5" />
                      GPS Tracking Data
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAdditionalData ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : gpsTracking.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground mb-4">
                          {gpsTracking.length} GPS points recorded
                        </p>
                        <RouteTrackingMap points={gpsTracking} />
                        <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                          {gpsTracking.slice(0, 10).map((point, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs"
                            >
                              <span>
                                {point.lat?.toFixed(6)}, {point.lng?.toFixed(6)}
                              </span>
                              {point.timestamp && (
                                <span className="text-muted-foreground">
                                  {format(
                                    new Date(point.timestamp),
                                    "HH:mm:ss",
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Navigation className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No GPS tracking data available
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Compliance Tab */}
              <TabsContent value="compliance" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Compliance Breakdown
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRecalculateDialog(true)}
                        disabled={isLoading}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Recalculate
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAdditionalData ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : complianceBreakdown ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                          <span className="text-sm font-medium">
                            Overall Compliance Score
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            {complianceBreakdown.overallScore ||
                              route.coverage ||
                              0}
                            %
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">
                              Waypoint Coverage
                            </p>
                            <p className="text-lg font-semibold">
                              {complianceBreakdown.waypointCoverage || 0}%
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">
                              Route Deviation
                            </p>
                            <p className="text-lg font-semibold">
                              {complianceBreakdown.routeDeviation || 0}%
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">
                              Time Compliance
                            </p>
                            <p className="text-lg font-semibold">
                              {complianceBreakdown.timeCompliance || 0}%
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-1">
                              Speed Compliance
                            </p>
                            <p className="text-lg font-semibold">
                              {complianceBreakdown.speedCompliance || 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Target className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No compliance data available
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Points Tab */}
              <TabsContent value="points" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Coins className="h-5 w-5" />
                      Points Awarded
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAdditionalData ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : pointsAwarded ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                          <span className="text-sm font-medium">
                            Total Points Awarded
                          </span>
                          <span className="text-2xl font-bold text-primary">
                            {pointsAwarded.totalPoints || 0}
                          </span>
                        </div>
                        {pointsAwarded.transactions &&
                        pointsAwarded.transactions.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              Transaction History
                            </p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {pointsAwarded.transactions.map(
                                (transaction: any, index: number) => (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">
                                        +{transaction.points || 0} points
                                      </p>
                                      {transaction.description && (
                                        <p className="text-xs text-muted-foreground">
                                          {transaction.description}
                                        </p>
                                      )}
                                    </div>
                                    {transaction.createdAt && (
                                      <span className="text-xs text-muted-foreground">
                                        {format(
                                          new Date(transaction.createdAt),
                                          "MMM d, yyyy",
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No points transactions found
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Coins className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No points data available
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Route Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingAdditionalData ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : timeline.length > 0 ? (
                      <div className="space-y-4">
                        {timeline.map((event, index) => (
                          <div key={index} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  event.type === "completed"
                                    ? "bg-green-500"
                                    : event.type === "cancelled"
                                      ? "bg-red-500"
                                      : event.type === "started"
                                        ? "bg-amber-500"
                                        : "bg-blue-500"
                                }`}
                              />
                              {index < timeline.length - 1 && (
                                <div className="w-0.5 h-full bg-border mt-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="text-sm font-medium">
                                {event.description}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(
                                  new Date(event.timestamp),
                                  "MMM d, yyyy HH:mm:ss",
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <History className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No timeline data available
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Manage Tab */}
              <TabsContent value="manage" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Route Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Route name</Label>
                        <Input
                          value={routeForm.name}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Downtown Loop"
                        />
                        {routeErrors.name && (
                          <p className="text-xs text-destructive">
                            {routeErrors.name}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Campaign</Label>
                        <Select
                          value={campaignId || "none"}
                          onValueChange={(value) =>
                            setCampaignId(value === "none" ? "" : value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select campaign" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No campaign</SelectItem>
                            {campaignOptions.map((campaign) => (
                              <SelectItem key={campaign.id} value={campaign.id}>
                                {campaign.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={routeForm.description}
                        onChange={(event) =>
                          setRouteForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Add rider guidance or notes."
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={routeForm.status}
                          onValueChange={(value) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              status: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select
                          value={routeForm.difficulty}
                          onValueChange={(value) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              difficulty: value,
                            }))
                          }
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
                      </div>
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input
                          value={routeForm.city}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              city: event.target.value,
                            }))
                          }
                        />
                        {routeErrors.city && (
                          <p className="text-xs text-destructive">
                            {routeErrors.city}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Country</Label>
                        <Input
                          value={routeForm.country}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              country: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Est. Duration (min)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={routeForm.estimatedDurationMinutes}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              estimatedDurationMinutes: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Coverage (km)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={routeForm.coverageKm}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              coverageKm: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Start latitude</Label>
                        <Input
                          type="number"
                          step={0.0001}
                          value={routeForm.startLat}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              startLat: event.target.value,
                            }))
                          }
                        />
                        {routeErrors.startLat && (
                          <p className="text-xs text-destructive">
                            {routeErrors.startLat}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Start longitude</Label>
                        <Input
                          type="number"
                          step={0.0001}
                          value={routeForm.startLng}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              startLng: event.target.value,
                            }))
                          }
                        />
                        {routeErrors.startLng && (
                          <p className="text-xs text-destructive">
                            {routeErrors.startLng}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>End latitude</Label>
                        <Input
                          type="number"
                          step={0.0001}
                          value={routeForm.endLat}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              endLat: event.target.value,
                            }))
                          }
                        />
                        {routeErrors.endLat && (
                          <p className="text-xs text-destructive">
                            {routeErrors.endLat}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>End longitude</Label>
                        <Input
                          type="number"
                          step={0.0001}
                          value={routeForm.endLng}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              endLng: event.target.value,
                            }))
                          }
                        />
                        {routeErrors.endLng && (
                          <p className="text-xs text-destructive">
                            {routeErrors.endLng}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Compliance tolerance (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={routeForm.tolerance}
                          onChange={(event) =>
                            setRouteForm((prev) => ({
                              ...prev,
                              tolerance: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          onClick={handleSaveRoute}
                          disabled={isSavingRoute}
                        >
                          {isSavingRoute ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save route details"
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Strategic Stops
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={addRouteStop}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add stop
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {routeStops.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                        No strategic stops configured yet.
                      </div>
                    ) : (
                      routeStops.map((stop, index) => (
                        <div
                          key={stop.id}
                          className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-semibold">
                                Stop {index + 1}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteStop(stop)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <Input
                              value={stop.name}
                              onChange={(event) =>
                                setRouteStops((prev) =>
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
                                setRouteStops((prev) =>
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
                                setRouteStops((prev) =>
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
                              setRouteStops((prev) =>
                                prev.map((item) =>
                                  item.id === stop.id
                                    ? { ...item, notes: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Notes for riders"
                          />
                          {stopErrors[stop.id] && (
                            <p className="text-xs text-destructive">
                              {stopErrors[stop.id]}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveStops}
                        disabled={isSavingStops}
                      >
                        {isSavingStops ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save stops"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Campaign Zones
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addCampaignZone}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add zone
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {campaignZones.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                        No campaign zones added yet.
                      </div>
                    ) : (
                      campaignZones.map((zone) => (
                        <div
                          key={zone.id}
                          className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
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
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteZone(zone)}
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
                          {zoneErrors[zone.id] && (
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
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Coins className="h-5 w-5" />
                      Hot Zones
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={addHotZone}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add hot zone
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {hotZones.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                        No hot zones added yet.
                      </div>
                    ) : (
                      hotZones.map((zone) => (
                        <div
                          key={zone.id}
                          className="rounded-lg border border-border/40 bg-background/70 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
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
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteHotZone(zone)}
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
                                      ? {
                                          ...item,
                                          startsAt: event.target.value,
                                        }
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
                          {hotZoneErrors[zone.id] && (
                            <p className="text-xs text-destructive">
                              {hotZoneErrors[zone.id]}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveZones}
                        disabled={isSavingZones}
                      >
                        {isSavingZones ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save zones"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Assignment Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      Manage assignment state for this rider route.
                    </p>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setShowUnassignDialog(true)}
                      disabled={route.status === "completed"}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Unassign route
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <DrawerFooter className="border-t border-border/50">
            <div className="flex items-center justify-between w-full">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportData}
                  disabled={isExportingData}
                >
                  {isExportingData ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Export Data
                    </>
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                {route.status !== "completed" &&
                  route.status !== "cancelled" && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectDialog(true)}
                        disabled={isLoading}
                        className="text-destructive hover:text-destructive"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => setShowApproveDialog(true)}
                        disabled={isLoading}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    </>
                  )}
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              </div>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve this route? This will mark it as
              completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Approving..." : "Approve Route"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this route? Please provide a
              reason for rejection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejection-reason">Rejection Reason</Label>
            <Textarea
              id="rejection-reason"
              placeholder="Enter reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={isLoading || !rejectionReason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Rejecting..." : "Reject Route"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recalculate Compliance Dialog */}
      <AlertDialog
        open={showRecalculateDialog}
        onOpenChange={setShowRecalculateDialog}
      >
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Compliance</AlertDialogTitle>
            <AlertDialogDescription>
              This will recalculate the compliance score for this route based on
              GPS tracking data and waypoint coverage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRecalculateCompliance}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Recalculating..." : "Recalculate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Dialog */}
      <AlertDialog
        open={showUnassignDialog}
        onOpenChange={setShowUnassignDialog}
      >
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign Route</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the rider assignment for this route. The route
              template will remain available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnassignRoute}
              disabled={isLoading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Unassigning..." : "Unassign Route"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
