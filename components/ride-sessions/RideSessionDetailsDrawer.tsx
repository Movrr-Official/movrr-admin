"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  Bike,
  Check,
  Clock,
  Coins,
  Gauge,
  Loader2,
  MapPin,
  Megaphone,
  MessageSquare,
  Route,
  ShieldCheck,
  ShieldX,
  Timer,
  TrendingUp,
  TriangleAlert,
  User,
  X,
  Zap,
} from "lucide-react";

import { verifyRideSession, VerificationAction } from "@/app/actions/rideSessions";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";

async function fetchRouteName(routeId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/suggested-routes/${routeId}`);
    if (!res.ok) return null;
    const json = await res.json() as { route?: { name?: string } };
    return json.route?.name ?? null;
  } catch {
    return null;
  }
}

interface RideSessionDetailsDrawerProps {
  session: RideSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified?: () => void;
}

const VerificationStatusBadge = ({
  status,
}: {
  status: RideSession["verificationStatus"];
}) => {
  switch (status) {
    case "verified":
      return (
        <Badge variant="success">
          <ShieldCheck className="h-3 w-3 mr-1" /> Verified
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive">
          <ShieldX className="h-3 w-3 mr-1" /> Rejected
        </Badge>
      );
    case "manual_review":
      return (
        <Badge variant="warning">
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
  onVerified,
}: RideSessionDetailsDrawerProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<VerificationAction | null>(null);
  const [reason, setReason] = useState("");
  const [showReasonFor, setShowReasonFor] = useState<VerificationAction | null>(null);

  // Reset action state when drawer closes or the viewed session changes
  useEffect(() => {
    if (!open) {
      setShowReasonFor(null);
      setReason("");
      setActionLoading(null);
    }
  }, [open, session?.id]);

  // Fetch suggested route name when linked — only fires when session has one
  const { data: suggestedRouteName } = useQuery({
    queryKey: ["suggestedRoute", session?.suggestedRouteId],
    queryFn: () => fetchRouteName(session!.suggestedRouteId!),
    enabled: !!session?.suggestedRouteId,
    staleTime: 1000 * 60 * 30,
  });

  if (!session) return null;

  const canApprove = session.verificationStatus !== "verified";
  const canReject = session.verificationStatus !== "rejected";
  const canEscalate = session.verificationStatus !== "manual_review";

  const handleAction = async (action: VerificationAction) => {
    if (action === "reject" || action === "escalate") {
      if (showReasonFor !== action) {
        setShowReasonFor(action);
        return;
      }
    }
    setActionLoading(action);
    const result = await verifyRideSession({ sessionId: session.id, action, reason: reason || undefined });
    setActionLoading(null);
    if (result.success) {
      toast({ title: action === "approve" ? "Session approved" : action === "reject" ? "Session rejected" : "Escalated to manual review" });
      setShowReasonFor(null);
      setReason("");
      onVerified?.();
    } else {
      toast({ title: "Action failed", description: result.error, variant: "destructive" });
    }
  };

  const duration = session.endedAt
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
                    ? "Standard Ride"
                    : "Boosted Ride"}
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
                <p className="text-xs text-muted-foreground">
                  Verified Minutes
                </p>
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
                  <p className="text-xs text-muted-foreground">
                    Total Duration
                  </p>
                </div>
                <p className="text-2xl font-bold">{duration} min</p>
              </div>
            )}
            {session.movingTime != null && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Moving Time</p>
                </div>
                <p className="text-2xl font-bold">{session.movingTime} min</p>
              </div>
            )}
            {session.rideQualityPercent != null && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge
                    className={`h-4 w-4 ${session.rideQualityPercent >= 70 ? "text-green-600" : session.rideQualityPercent >= 40 ? "text-amber-600" : "text-red-600"}`}
                  />
                  <p className="text-xs text-muted-foreground">Quality Score</p>
                </div>
                <p
                  className={`text-2xl font-bold ${session.rideQualityPercent >= 70 ? "text-green-600" : session.rideQualityPercent >= 40 ? "text-amber-600" : "text-red-600"}`}
                >
                  {session.rideQualityPercent}%
                </p>
              </div>
            )}
            {session.bikeType && (
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  {session.bikeType === "e_bike" ? (
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Bike className="h-4 w-4 text-muted-foreground" />
                  )}
                  <p className="text-xs text-muted-foreground">Bike Type</p>
                </div>
                <p className="text-sm font-semibold capitalize">
                  {session.bikeType === "e_bike"
                    ? "E-Bike"
                    : session.bikeType === "fat_bike"
                      ? "Fat Bike"
                      : session.bikeType === "standard_bike"
                        ? "Standard Bike"
                        : "Unknown"}
                </p>
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
              <p className="text-sm font-medium">
                {session.riderName ?? "Unknown"}
              </p>
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
                    <Badge
                      key={code}
                      variant="secondary"
                      className="font-mono text-xs"
                    >
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

          {/* Suggested Route */}
          {session.suggestedRouteId && (
            <Card className="glass-card border-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Suggested Route
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-start text-sm">
                  <span className="font-medium">
                    {suggestedRouteName ?? "Loading…"}
                  </span>
                  <a
                    href="/suggested-routes"
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    View routes
                  </a>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  {session.suggestedRouteId}
                </p>
                {session.complianceScore != null && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                    <Gauge
                      className={`h-5 w-5 ${session.complianceScore >= 80 ? "text-green-600" : session.complianceScore >= 50 ? "text-amber-600" : "text-red-600"}`}
                    />
                    <div>
                      <p className="text-xs text-muted-foreground">Compliance Score</p>
                      <p
                        className={`text-lg font-bold ${session.complianceScore >= 80 ? "text-green-600" : session.complianceScore >= 50 ? "text-amber-600" : "text-red-600"}`}
                      >
                        {session.complianceScore}%
                      </p>
                    </div>
                    {session.bonusApplied != null && session.bonusApplied > 0 && (
                      <div className="ml-auto text-right">
                        <p className="text-xs text-muted-foreground">Bonus Applied</p>
                        <p className="text-sm font-semibold text-amber-600">
                          +{session.bonusApplied} pts
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Verification Actions */}
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Verification Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {canApprove && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950 dark:text-green-400 dark:border-green-800"
                    disabled={!!actionLoading}
                    onClick={() => handleAction("approve")}
                  >
                    {actionLoading === "approve" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Approve
                  </Button>
                )}
                {canReject && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950 dark:text-red-400 dark:border-red-800"
                    disabled={!!actionLoading}
                    onClick={() => handleAction("reject")}
                  >
                    {actionLoading === "reject" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ShieldX className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Reject
                  </Button>
                )}
                {canEscalate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                    disabled={!!actionLoading}
                    onClick={() => handleAction("escalate")}
                  >
                    {actionLoading === "escalate" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <TriangleAlert className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Escalate
                  </Button>
                )}
              </div>

              {showReasonFor && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Reason for {showReasonFor} (optional)</span>
                  </div>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter reason or notes…"
                    rows={2}
                    className="resize-none text-sm rounded-xl border-border/50 bg-background/60 backdrop-blur-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!!actionLoading}
                      onClick={async () => {
                        setActionLoading(showReasonFor);
                        const result = await verifyRideSession({ sessionId: session.id, action: showReasonFor, reason: reason || undefined });
                        setActionLoading(null);
                        if (result.success) {
                          toast({ title: showReasonFor === "reject" ? "Session rejected" : "Escalated to manual review" });
                          setShowReasonFor(null);
                          setReason("");
                          onVerified?.();
                        } else {
                          toast({ title: "Action failed", description: result.error, variant: "destructive" });
                        }
                      }}
                    >
                      {actionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                      Confirm {showReasonFor}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowReasonFor(null); setReason(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
