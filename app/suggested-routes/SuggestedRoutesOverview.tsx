"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Route,
  Edit,
  PowerOff,
  MapPin,
  Clock,
  Coins,
  BarChart3,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { StatsCard } from "@/components/stats/StatsCard";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestedRoute {
  id: string;
  name: string;
  description?: string | null;
  city?: string | null;
  zones: string[];
  difficulty: "easy" | "moderate" | "challenging";
  estimated_duration_minutes: number;
  estimated_distance_meters: number;
  reward_type: "multiplier" | "bonus";
  reward_value: number;
  max_bonus_per_ride?: number | null;
  max_total_rewards?: number | null;
  active: boolean;
  start_at?: string | null;
  end_at?: string | null;
  created_at: string;
  updated_at?: string;
  geometry: Array<{ lat: number; lng: number }>;
}

interface ListResponse {
  routes: SuggestedRoute[];
  total: number;
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const routeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional(),
  city: z.string().trim().max(100).optional(),
  difficulty: z.enum(["easy", "moderate", "challenging"]),
  estimatedDurationMinutes: z.coerce.number().int().min(1).max(600),
  estimatedDistanceMeters: z.coerce.number().int().min(100).max(500_000),
  rewardType: z.enum(["multiplier", "bonus"]),
  rewardValue: z.coerce.number().min(0).max(100),
  maxBonusPerRide: z.coerce.number().int().min(0).optional(),
  maxTotalRewards: z.coerce.number().int().min(0).optional(),
  active: z.boolean(),
});

type RouteFormData = z.infer<typeof routeFormSchema>;

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchRoutes(
  filter: "all" | "true" | "false",
): Promise<ListResponse> {
  const params = new URLSearchParams({ active: filter, limit: "100" });
  const res = await fetch(`/api/suggested-routes?${params}`);
  if (!res.ok) throw new Error("Failed to fetch suggested routes");
  return res.json();
}

async function createRoute(
  data: RouteFormData,
): Promise<{ route: SuggestedRoute }> {
  const body = {
    ...data,
    // Placeholder geometry — admins must add waypoints via map (future feature)
    geometry: [
      { lat: 52.37, lng: 4.89 },
      { lat: 52.38, lng: 4.9 },
    ],
    zones: data.city ? [data.city] : [],
  };
  const res = await fetch("/api/suggested-routes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to create route",
    );
  }
  return res.json();
}

async function updateRoute(
  id: string,
  data: Partial<RouteFormData>,
): Promise<{ route: SuggestedRoute }> {
  const res = await fetch(`/api/suggested-routes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to update route",
    );
  }
  return res.json();
}

async function deactivateRoute(id: string): Promise<void> {
  const res = await fetch(`/api/suggested-routes/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to deactivate route");
}

// ─── Difficulty badge ─────────────────────────────────────────────────────────

const difficultyVariant = (d: string) =>
  d === "easy" ? "success" : d === "moderate" ? "warning" : "destructive";

// ─── Main component ───────────────────────────────────────────────────────────

export default function SuggestedRoutesOverview() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"all" | "true" | "false">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SuggestedRoute | null>(null);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ["suggestedRoutes", filter],
    queryFn: () => fetchRoutes(filter),
    staleTime: 1000 * 60 * 5,
  });

  const routes = (data?.routes ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.city ?? "").toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q)
    );
  });

  const totalActive = (data?.routes ?? []).filter((r) => r.active).length;
  const totalInactive = (data?.routes ?? []).filter((r) => !r.active).length;
  const avgDistanceKm = routes.length
    ? Math.round(
        routes.reduce((sum, r) => sum + r.estimated_distance_meters, 0) /
          routes.length /
          100,
      ) / 10
    : 0;

  const createMutation = useMutation({
    mutationFn: createRoute,
    onSuccess: () => {
      toast({ title: "Route created" });
      queryClient.invalidateQueries({ queryKey: ["suggestedRoutes"] });
      setDialogOpen(false);
    },
    onError: (e: Error) =>
      toast({
        title: "Create failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RouteFormData> }) =>
      updateRoute(id, data),
    onSuccess: () => {
      toast({ title: "Route updated" });
      queryClient.invalidateQueries({ queryKey: ["suggestedRoutes"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) =>
      toast({
        title: "Update failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateRoute,
    onSuccess: () => {
      toast({ title: "Route deactivated" });
      queryClient.invalidateQueries({ queryKey: ["suggestedRoutes"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Deactivate failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (route: SuggestedRoute) => {
    setEditing(route);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        action={{
          label: "New Route",
          onClick: openCreate,
          icon: <Plus className="h-4 w-4 mr-1" />,
        }}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Routes"
          value={isLoading ? "—" : (data?.total ?? 0)}
          icon={Route}
        />
        <StatsCard
          title="Active"
          value={isLoading ? "—" : totalActive}
          icon={ChevronRight}
          animationDelay="0.1s"
        />
        <StatsCard
          title="Inactive"
          value={isLoading ? "—" : totalInactive}
          icon={PowerOff}
          animationDelay="0.2s"
        />
        <StatsCard
          title="Avg Distance"
          value={isLoading ? "—" : `${avgDistanceKm} km`}
          icon={MapPin}
          animationDelay="0.3s"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search routes…"
            className="pl-9 rounded-xl border-border/50"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(["all", "true", "false"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={filter === v ? "default" : "outline"}
              onClick={() => setFilter(v)}
            >
              {v === "all" ? "All" : v === "true" ? "Active" : "Inactive"}
            </Button>
          ))}
        </div>
      </div>

      {/* Route list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card className="glass-card border-0">
          <CardContent className="py-12 text-center text-muted-foreground">
            Failed to load routes. Check your connection and try again.
          </CardContent>
        </Card>
      ) : routes.length === 0 ? (
        <Card className="glass-card border-0">
          <CardContent className="py-12 text-center">
            <Route className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm font-medium text-muted-foreground">
              No routes found
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create first route
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              onEdit={() => openEdit(route)}
              onDeactivate={() => deactivateMutation.mutate(route.id)}
              isDeactivating={
                deactivateMutation.isPending &&
                deactivateMutation.variables === route.id
              }
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <RouteFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSubmit={(data) => {
          if (editing) {
            updateMutation.mutate({ id: editing.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// ─── Route Card ───────────────────────────────────────────────────────────────

function RouteCard({
  route,
  onEdit,
  onDeactivate,
  isDeactivating,
}: {
  route: SuggestedRoute;
  onEdit: () => void;
  onDeactivate: () => void;
  isDeactivating: boolean;
}) {
  const distanceKm = (route.estimated_distance_meters / 1000).toFixed(1);

  return (
    <Card className="glass-card border-0 flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {route.name}
            </CardTitle>
            {route.city && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {route.city}
              </p>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge
              variant={route.active ? "success" : "secondary"}
              className="text-xs"
            >
              {route.active ? "Active" : "Inactive"}
            </Badge>
            <Badge
              variant={difficultyVariant(route.difficulty)}
              className="text-xs capitalize"
            >
              {route.difficulty}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {route.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {route.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
              <MapPin className="h-3 w-3" /> Distance
            </p>
            <p className="text-sm font-bold">{distanceKm} km</p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
              <Clock className="h-3 w-3" /> Duration
            </p>
            <p className="text-sm font-bold">
              {route.estimated_duration_minutes} min
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
              <Coins className="h-3 w-3" /> Reward
            </p>
            <p className="text-sm font-bold">
              {route.reward_type === "multiplier"
                ? `×${route.reward_value}`
                : `+${route.reward_value} pts`}
            </p>
          </div>
          {route.max_bonus_per_ride != null && (
            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                <BarChart3 className="h-3 w-3" /> Cap/ride
              </p>
              <p className="text-sm font-bold">
                {route.max_bonus_per_ride} pts
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <p className="text-xs text-muted-foreground flex-1">
            Created {format(new Date(route.created_at), "MMM d, yyyy")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onEdit}
          >
            <Edit className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          {route.active && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onDeactivate}
              disabled={isDeactivating}
            >
              {isDeactivating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PowerOff className="h-3.5 w-3.5 mr-1" />
              )}
              Deactivate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create / Edit Dialog ─────────────────────────────────────────────────────

function RouteFormDialog({
  open,
  onOpenChange,
  editing,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: SuggestedRoute | null;
  onSubmit: (data: RouteFormData) => void;
  isSubmitting: boolean;
}) {
  const form = useForm<RouteFormData>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      name: "",
      description: "",
      city: "",
      difficulty: "easy",
      estimatedDurationMinutes: 30,
      estimatedDistanceMeters: 5000,
      rewardType: "bonus",
      rewardValue: 10,
      active: true,
    },
  });

  // Reset form when dialog opens with editing data
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        name: editing.name,
        description: editing.description ?? "",
        city: editing.city ?? "",
        difficulty: editing.difficulty,
        estimatedDurationMinutes: editing.estimated_duration_minutes,
        estimatedDistanceMeters: editing.estimated_distance_meters,
        rewardType: editing.reward_type,
        rewardValue: editing.reward_value,
        maxBonusPerRide: editing.max_bonus_per_ride ?? undefined,
        maxTotalRewards: editing.max_total_rewards ?? undefined,
        active: editing.active,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        city: "",
        difficulty: "easy",
        estimatedDurationMinutes: 30,
        estimatedDistanceMeters: 5000,
        rewardType: "bonus",
        rewardValue: 10,
        active: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Route" : "Create Suggested Route"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Canal Ring Loop"
                      className="rounded-xl border-border/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={2}
                      className="resize-none rounded-xl border-border/50"
                      placeholder="Route description…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Amsterdam"
                        className="rounded-xl border-border/50"
                      />
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="challenging">Challenging</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="estimatedDistanceMeters"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distance (m)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={100}
                        className="rounded-xl border-border/50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimatedDurationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        className="rounded-xl border-border/50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="rewardType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bonus">Bonus Points</SelectItem>
                        <SelectItem value="multiplier">Multiplier</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rewardValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reward Value</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        step={0.1}
                        className="rounded-xl border-border/50"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="maxBonusPerRide"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Bonus / Ride (pts)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="rounded-xl border-border/50"
                        placeholder="No cap"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxTotalRewards"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Total Rewards</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="rounded-xl border-border/50"
                        placeholder="No limit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3">
                  <FormLabel className="text-sm font-semibold cursor-pointer">
                    Active
                  </FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editing ? "Saving…" : "Creating…"}
                  </>
                ) : editing ? (
                  "Save Changes"
                ) : (
                  "Create Route"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
