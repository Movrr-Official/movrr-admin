"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import {
  useCreateCommunityRide,
  useUpdateCommunityRide,
} from "@/hooks/useCommunityRidesData";
import {
  CommunityRide,
  communityRideCategorySchema,
  communityRideOrganizerTypeSchema,
} from "@/schemas";

// ─── Constants ────────────────────────────────────────────────────────────────

const BIKE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "standard_bike", label: "Standard bike" },
  { value: "e_bike", label: "E-bike" },
  { value: "fat_bike", label: "Fat bike" },
];

// ─── Form schema ──────────────────────────────────────────────────────────────

const optCoord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(min).max(max).optional(),
  );

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Scheduled date is required"),
  meetingPointName: z.string().optional(),
  meetingPointLat: optCoord(-90, 90),
  meetingPointLng: optCoord(-180, 180),
  maxParticipants: z.number().int().min(2, "Minimum 2").max(100, "Maximum 100"),
  bikeTypesAllowed: z.array(z.string()).optional(),
  category: communityRideCategorySchema,
  isPublic: z.boolean(),
  organizerType: communityRideOrganizerTypeSchema.default("movrr"),
  organizerName: z.string().min(1, "Organizer name is required").max(100),
  organizerRiderId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  } catch {
    return "";
  }
}

const DEFAULT_VALUES: FormValues = {
  title: "",
  description: "",
  scheduledAt: "",
  meetingPointName: "",
  meetingPointLat: undefined,
  meetingPointLng: undefined,
  maxParticipants: 20,
  bikeTypesAllowed: [],
  category: "social",
  isPublic: true,
  organizerType: "movrr",
  organizerName: "MOVRR",
  organizerRiderId: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface CommunityRideFormDrawerProps {
  /** Pass a ride to edit, null to create. */
  ride: CommunityRide | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function CommunityRideFormDrawer({
  ride,
  isOpen,
  onClose,
  onSaved,
}: CommunityRideFormDrawerProps) {
  const { toast } = useToast();
  const createMutation = useCreateCommunityRide();
  const updateMutation = useUpdateCommunityRide();
  const isEditing = !!ride;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (isOpen) {
      form.reset(
        ride
          ? {
              title: ride.title,
              description: ride.description ?? "",
              scheduledAt: toDatetimeLocal(ride.scheduledAt),
              meetingPointName: ride.meetingPointName ?? "",
              meetingPointLat: ride.meetingPointLat ?? undefined,
              meetingPointLng: ride.meetingPointLng ?? undefined,
              maxParticipants: ride.maxParticipants,
              bikeTypesAllowed: ride.bikeTypesAllowed ?? [],
              category: ride.category,
              isPublic: ride.isPublic,
              organizerType: ride.organizerType,
              organizerName: ride.organizerName,
              organizerRiderId: ride.organizerRiderId ?? "",
            }
          : DEFAULT_VALUES,
      );
    }
  }, [isOpen, ride, form]);

  const onSubmit = async (values: FormValues) => {
    const scheduledAt = new Date(values.scheduledAt).toISOString();

    const result = isEditing
      ? await updateMutation.mutateAsync({
          id: ride!.id,
          title: values.title,
          description: values.description?.trim() || undefined,
          scheduledAt,
          meetingPointName: values.meetingPointName?.trim() || undefined,
          meetingPointLat: values.meetingPointLat,
          meetingPointLng: values.meetingPointLng,
          maxParticipants: values.maxParticipants,
          bikeTypesAllowed: values.bikeTypesAllowed ?? [],
          category: values.category,
          isPublic: values.isPublic,
        })
      : await createMutation.mutateAsync({
          title: values.title,
          description: values.description?.trim() || undefined,
          scheduledAt,
          meetingPointName: values.meetingPointName?.trim() || undefined,
          meetingPointLat: values.meetingPointLat,
          meetingPointLng: values.meetingPointLng,
          maxParticipants: values.maxParticipants,
          bikeTypesAllowed: values.bikeTypesAllowed ?? [],
          category: values.category,
          isPublic: values.isPublic,
          organizerType: values.organizerType,
          organizerName: values.organizerName.trim(),
          organizerRiderId: values.organizerRiderId?.trim() || undefined,
        });

    if (result.success) {
      toast({ title: isEditing ? "Ride updated" : "Community ride created" });
      onClose();
      onSaved?.();
    } else {
      toast({
        title: isEditing ? "Failed to update ride" : "Failed to create ride",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const isTerminal =
    isEditing &&
    (ride!.status === "completed" || ride!.status === "cancelled");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>
            {isEditing ? "Edit Community Ride" : "Create Community Ride"}
          </SheetTitle>
          <SheetDescription>
            {isTerminal
              ? `This ride is ${ride!.status} and cannot be edited.`
              : isEditing
                ? "Update the ride details below."
                : "Schedule a new community ride. Riders can discover and join it from the app."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {isTerminal ? (
                <p className="text-sm text-muted-foreground">
                  Rides that have been {ride!.status} cannot be modified.
                </p>
              ) : (
                <>
                  {/* Title */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Sunday Morning City Loop"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Description */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional details about the route, pace, or requirements"
                            rows={3}
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Date & Time */}
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date &amp; Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Meeting Point */}
                  <FormField
                    control={form.control}
                    name="meetingPointName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meeting Point</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Vondelpark main entrance"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* GPS Coordinates */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="meetingPointLat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={0.000001}
                              placeholder="51.5074"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="meetingPointLng"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={0.000001}
                              placeholder="-0.1278"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value),
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Category + Max Participants */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="beginner">Beginner</SelectItem>
                              <SelectItem value="intermediate">Intermediate</SelectItem>
                              <SelectItem value="challenging">Challenging</SelectItem>
                              <SelectItem value="social">Social</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxParticipants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Participants</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={isEditing ? Math.max(2, ride!.participantCount) : 2}
                              max={100}
                              {...field}
                              onChange={(e) =>
                                field.onChange(Number(e.target.value) || 2)
                              }
                            />
                          </FormControl>
                          {isEditing && ride!.participantCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Min {ride!.participantCount} (current count)
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Bike Types */}
                  <FormField
                    control={form.control}
                    name="bikeTypesAllowed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowed Bike Types</FormLabel>
                        <p className="text-xs text-muted-foreground -mt-1">
                          Leave all unchecked to allow any bike type.
                        </p>
                        <div className="flex gap-4 pt-1">
                          {BIKE_TYPE_OPTIONS.map((opt) => {
                            const checked = (field.value ?? []).includes(opt.value);
                            return (
                              <label
                                key={opt.value}
                                className="flex items-center gap-2 text-sm cursor-pointer"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) => {
                                    const current = field.value ?? [];
                                    field.onChange(
                                      next
                                        ? [...current, opt.value]
                                        : current.filter((v) => v !== opt.value),
                                    );
                                  }}
                                />
                                {opt.label}
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Organizer config — create only */}
                  {!isEditing && (
                    <>
                      <FormField
                        control={form.control}
                        name="organizerType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organizer Type</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                if (value === "movrr") {
                                  form.setValue("organizerName", "MOVRR");
                                  form.setValue("organizerRiderId", "");
                                }
                              }}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="movrr">MOVRR</SelectItem>
                                <SelectItem value="admin">Admin user</SelectItem>
                                <SelectItem value="rider">Rider</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="organizerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organizer Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Displayed organizer label"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch("organizerType") === "rider" && (
                        <FormField
                          control={form.control}
                          name="organizerRiderId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Organizer Rider ID</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Rider UUID"
                                  className="font-mono text-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}

                  {/* Public toggle */}
                  <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                        <div>
                          <FormLabel className="cursor-pointer">
                            Public Ride
                          </FormLabel>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Visible to all riders in the app
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isPending}
              >
                {isTerminal ? "Close" : "Cancel"}
              </Button>
              {!isTerminal && (
                <Button type="submit" className="flex-1" disabled={isPending}>
                  {isPending
                    ? "Saving..."
                    : isEditing
                      ? "Save Changes"
                      : "Create Ride"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
