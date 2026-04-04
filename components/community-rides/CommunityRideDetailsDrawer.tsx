"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Calendar,
  MapPin,
  Users,
  Gauge,
  UserMinus,
  XCircle,
  Trash2,
  Pencil,
  PlayCircle,
  CheckCircle2,
  Globe,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/useToast";
import {
  useUpdateCommunityRide,
  useRemoveParticipant,
  useDeleteCommunityRide,
} from "@/hooks/useCommunityRidesData";
import { CommunityRide, CommunityRideParticipant } from "@/schemas";
import { getCategoryBadge, getStatusBadge } from "./CommunityRidesTableColumns";
import { CommunityRideFormDrawer } from "./CommunityRideFormDrawer";

interface CommunityRideDetailsDrawerProps {
  ride: CommunityRide | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CommunityRideDetailsDrawer({
  ride,
  isOpen,
  onClose,
}: CommunityRideDetailsDrawerProps) {
  const { toast } = useToast();
  const updateMutation = useUpdateCommunityRide();
  const removeMutation = useRemoveParticipant();
  const deleteMutation = useDeleteCommunityRide();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [participantToRemove, setParticipantToRemove] =
    useState<CommunityRideParticipant | null>(null);

  if (!ride) return null;

  const canCancel = ride.status === "upcoming" || ride.status === "active";
  const canActivate = ride.status === "upcoming";
  const canComplete = ride.status === "active";
  const canEdit = ride.status !== "completed" && ride.status !== "cancelled";
  const activeParticipants = (ride.participants ?? []).filter(
    (p) => p.status === "joined",
  );

  const handleStatusChange = async (
    newStatus: "active" | "completed" | "cancelled",
    closeConfirm: () => void,
  ) => {
    const result = await updateMutation.mutateAsync({ id: ride.id, status: newStatus });
    if (result.success) {
      const labels: Record<string, string> = {
        active: "Ride marked as active",
        completed: "Ride marked as completed",
        cancelled: "Ride cancelled",
      };
      toast({ title: labels[newStatus] ?? "Ride updated" });
      closeConfirm();
      onClose();
    } else {
      toast({
        title: "Failed to update ride",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => handleStatusChange("cancelled", () => setConfirmCancel(false));

  const handleDelete = async () => {
    const result = await deleteMutation.mutateAsync(ride.id);
    if (result.success) {
      toast({ title: "Ride deleted" });
      setConfirmDelete(false);
      onClose();
    } else {
      toast({
        title: "Failed to delete ride",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const handleRemoveParticipant = async () => {
    if (!participantToRemove) return;
    const result = await removeMutation.mutateAsync({
      rideId: ride.id,
      riderId: participantToRemove.riderId,
    });
    if (result.success) {
      toast({ title: `${participantToRemove.riderName} removed from ride` });
      setParticipantToRemove(null);
    } else {
      toast({
        title: "Failed to remove participant",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg font-bold truncate">
                  {ride.title}
                </SheetTitle>
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  Organised by {ride.organizerName}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {getStatusBadge(ride.status)}
                {getCategoryBadge(ride.category)}
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-6">
              {/* Description */}
              {ride.description && (
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {ride.description}
                  </p>
                </div>
              )}

              <Separator />

              {/* Details */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Details
                </h3>

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(
                        new Date(ride.scheduledAt),
                        "EEEE, MMMM d, yyyy 'at' h:mm a",
                      )}
                    </p>
                  </div>
                </div>

                {ride.meetingPointName && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-foreground">
                      {ride.meetingPointName}
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    {ride.participantCount} of {ride.maxParticipants} spots
                    filled
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <Gauge className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground capitalize">
                    {ride.category}
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  {ride.isPublic ? (
                    <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-sm text-foreground">
                    {ride.isPublic ? "Public ride" : "Private ride"}
                  </p>
                </div>

                {ride.bikeTypesAllowed && ride.bikeTypesAllowed.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {ride.bikeTypesAllowed.map((type) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Participants */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Participants ({activeParticipants.length})
                </h3>

                {activeParticipants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active participants.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeParticipants.map((p) => {
                      const isOrganiser = p.riderId === ride.organizerRiderId;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-semibold text-primary">
                                {p.riderName
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {p.riderName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Joined{" "}
                                {format(new Date(p.joinedAt), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isOrganiser && (
                              <Badge
                                variant="secondary"
                                className="text-xs shrink-0"
                              >
                                Organiser
                              </Badge>
                            )}
                            {!isOrganiser && canCancel && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setParticipantToRemove(p)}
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-border space-y-2">
            <div className="flex gap-2 flex-wrap">
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                  disabled={updateMutation.isPending}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
              )}
              {canActivate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmActivate(true)}
                  disabled={updateMutation.isPending}
                  className="text-success border-success/40 hover:bg-success/10"
                >
                  <PlayCircle className="h-4 w-4 mr-1.5" />
                  Mark Active
                </Button>
              )}
              {canComplete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmComplete(true)}
                  disabled={updateMutation.isPending}
                  className="text-info border-info/40 hover:bg-info/10"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Mark Complete
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancel(true)}
                  disabled={updateMutation.isPending}
                  className="text-warning border-warning/40 hover:bg-warning/10"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Cancel Ride
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteMutation.isPending}
                className="text-destructive border-destructive/40 hover:bg-destructive/10 ml-auto"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit form drawer */}
      <CommunityRideFormDrawer
        ride={ride}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />

      {/* Activate confirmation */}
      <AlertDialog open={confirmActivate} onOpenChange={setConfirmActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark ride as active?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set the ride status to <strong>Active</strong>. Riders will
              see it as in progress. You can still cancel it after activation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusChange("active", () => setConfirmActivate(false))}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              Mark Active
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete confirmation */}
      <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark ride as completed?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set the ride status to <strong>Completed</strong>. This
              cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleStatusChange("completed", () => setConfirmComplete(false))}
            >
              Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ride?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the ride as cancelled. Participants will be
              notified. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep ride</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Cancel ride
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this ride?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the ride and all participant records. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep ride</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove participant confirmation */}
      <AlertDialog
        open={!!participantToRemove}
        onOpenChange={(open) => !open && setParticipantToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove participant?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {participantToRemove?.riderName} from this ride? They will
              no longer appear in the participant list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveParticipant}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
