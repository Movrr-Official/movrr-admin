"use client";

import { format } from "date-fns";
import {
  AlertCircle,
  Bike,
  Clock,
  Coins,
  MapPin,
  Megaphone,
  ShieldCheck,
  ShieldX,
  Timer,
  User,
  X,
} from "lucide-react";

import { RideSession } from "@/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface RideSessionDetailsDrawerProps {
  session: RideSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VerificationStatusBadge = ({
  status,
}: {
  status: RideSession["verificationStatus"];
}) => {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <ShieldCheck className="h-3 w-3 mr-1" /> Verified
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <ShieldX className="h-3 w-3 mr-1" /> Rejected
        </Badge>
      );
    case "manual_review":
      return (
        <Badge className="bg-orange-50 text-orange-700 border-orange-200 font-medium dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
          <AlertCircle className="h-3 w-3 mr-1" /> Manual Review
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export function RideSessionDetailsDrawer({
  session,
  open,
  onOpenChange,
}: RideSessionDetailsDrawerProps) {
  if (!session) return null;

  const duration =
    session.endedAt
      ? Math.round(
          (new Date(session.endedAt).getTime() -
            new Date(session.startedAt).getTime()) /
            60000,
        )
      : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full w-full max-w-lg ml-auto rounded-none">
        <DrawerHeader className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <DrawerTitle className="text-xl font-bold">
              Ride Session Details
            </DrawerTitle>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {session.id}
            </p>
          </div>
          <DrawerClose asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Banner */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-center gap-3">
              {session.earningMode === "standard_ride" ? (
                <div className="p-2 bg-sky-50 rounded-lg dark:bg-sky-950">
                  <Bike className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                </div>
              ) : (
                <div className="p-2 bg-violet-50 rounded-lg dark:bg-violet-950">
                  <Megaphone className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">
                  {session.earningMode === "standard_ride"
                    ? "Free Ride"
                    : "Campaign Ride"}
                </p>
                {session.campaignName && (
                  <p className="text-xs text-muted-foreground">
                    {session.campaignName}
                  </p>
                )}
              </div>
            </div>
            <VerificationStatusBadge status={session.verificationStatus} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Verified Minutes</p>
              </div>
              <p className="text-2xl font-bold">{session.verifiedMinutes}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 mb-1">
                <Coins className="h-4 w-4 text-amber-600" />
                <p className="text-xs text-muted-foreground">Points Awarded</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">
                +{session.pointsAwarded.toLocaleString()}
              </p>
            </div>
            {duration !== null && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Total Duration</p>
                </div>
                <p className="text-2xl font-bold">{duration} min</p>
              </div>
            )}
          </div>

          {/* Rider Info */}
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Rider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm font-medium">{session.riderName ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {session.riderId}
              </p>
            </CardContent>
          </Card>

          {/* Session Timing */}
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Session Timing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started</span>
                <span className="font-medium">
                  {format(new Date(session.startedAt), "MMM d, yyyy HH:mm")}
                </span>
              </div>
              {session.endedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ended</span>
                  <span className="font-medium">
                    {format(new Date(session.endedAt), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          {(session.city || session.country) && (
            <Card className="glass-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">
                  {[session.city, session.country].filter(Boolean).join(", ")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Verification Details */}
          {session.reasonCodes.length > 0 && (
            <Card className="glass-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  Verification Reason Codes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {session.reasonCodes.map((code) => (
                    <Badge key={code} variant="secondary" className="font-mono text-xs">
                      {code}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campaign */}
          {session.campaignId && (
            <Card className="glass-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Megaphone className="h-4 w-4" />
                  Campaign
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {session.campaignName && (
                  <p className="text-sm font-medium">{session.campaignName}</p>
                )}
                <p className="text-xs text-muted-foreground font-mono">
                  {session.campaignId}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
