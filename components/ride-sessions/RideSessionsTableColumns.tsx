import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Circle,
  Clock,
  Coins,
  Eye,
  Gauge,
  MapPin,
  Megaphone,
  MoreHorizontal,
  PauseCircle,
  ShieldCheck,
  ShieldX,
  Timer,
  User,
  XCircle,
  Zap,
} from "lucide-react";

import { RideSession, RideSessionStatus } from "@/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getLifecycleBadge = (status: RideSessionStatus | undefined) => {
  switch (status) {
    case "active":
      return (
        <Badge variant="success" className="text-xs font-medium">
          <Circle className="h-2 w-2 mr-1 fill-current" />
          Active
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="info" className="text-xs font-medium">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "paused":
      return (
        <Badge variant="warning" className="text-xs font-medium">
          <PauseCircle className="h-3 w-3 mr-1" />
          Paused
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary" className="text-xs font-medium">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive" className="text-xs font-medium">
          <XCircle className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="secondary" className="text-xs font-medium">
          <Circle className="h-2 w-2 mr-1" />
          Draft
        </Badge>
      );
    default:
      return <Badge variant="secondary" className="text-xs">Unknown</Badge>;
  }
};

const getVerificationBadge = (status: RideSession["verificationStatus"]) => {
  switch (status) {
    case "verified":
      return (
        <Badge variant="success">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="destructive">
          <ShieldX className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    case "manual_review":
      return (
        <Badge variant="warning">
          <AlertCircle className="h-3 w-3 mr-1" />
          Review
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getEarningModeBadge = (mode: RideSession["earningMode"]) => {
  if (mode === "standard_ride") {
    return (
      <Badge variant="info">
        <Bike className="h-3 w-3 mr-1" />
        Standard Ride
      </Badge>
    );
  }
  return (
    <Badge variant="accent">
      <Megaphone className="h-3 w-3 mr-1" />
      Boosted Ride
    </Badge>
  );
};

interface RideSessionsTableColumnsProps {
  onView?: (session: RideSession) => void;
}

export function getRideSessionsTableColumns({
  onView,
}: RideSessionsTableColumnsProps = {}): ColumnDef<RideSession>[] {
  return [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => {
        const date = new Date(row.original.startedAt);
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {format(date, "MMM d, yyyy")}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => getLifecycleBadge(row.original.status),
    },
    {
      accessorKey: "riderId",
      header: "Rider",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="h-3 w-3 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {row.original.riderName ?? "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {row.original.riderId.slice(0, 8)}
            </span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "earningMode",
      header: "Ride Mode",
      cell: ({ row }) => getEarningModeBadge(row.original.earningMode),
    },
    {
      accessorKey: "verificationStatus",
      header: "Verification",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {getVerificationBadge(row.original.verificationStatus)}
          {row.original.reasonCodes.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {row.original.reasonCodes.join(", ")}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "verifiedMinutes",
      header: "Duration",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            {row.original.verifiedMinutes} min
          </span>
        </div>
      ),
    },
    {
      accessorKey: "pointsAwarded",
      header: "Points",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Coins className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-sm font-semibold">
            +{row.original.pointsAwarded.toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "campaignId",
      header: "Campaign",
      cell: ({ row }) => {
        const { campaignId, campaignName } = row.original;
        if (!campaignId)
          return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Megaphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">
              {campaignName ?? campaignId.slice(0, 8)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "bikeType",
      header: "Bike",
      cell: ({ row }) => {
        const { bikeType, rideQualityPercent } = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            {bikeType ? (
              <div className="flex items-center gap-1.5">
                {bikeType === "e_bike" ? (
                  <Zap className="h-3 w-3 text-violet-500" />
                ) : (
                  <Bike className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-sm">
                  {bikeType === "e_bike"
                    ? "E-Bike"
                    : bikeType === "fat_bike"
                      ? "Fat Bike"
                      : bikeType === "standard_bike"
                        ? "Standard"
                        : "Unknown"}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {rideQualityPercent != null && (
              <div className="flex items-center gap-1">
                <Gauge
                  className={`h-3 w-3 ${rideQualityPercent >= 70 ? "text-green-600" : rideQualityPercent >= 40 ? "text-amber-500" : "text-red-500"}`}
                />
                <span
                  className={`text-xs font-medium ${rideQualityPercent >= 70 ? "text-green-600" : rideQualityPercent >= 40 ? "text-amber-500" : "text-red-500"}`}
                >
                  {rideQualityPercent}%
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => {
        const { city, country } = row.original;
        if (!city && !country)
          return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">
              {[city, country].filter(Boolean).join(", ")}
            </span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const session = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="glass-card border-0 backdrop-blur-xl"
            >
              {onView && (
                <DropdownMenuItem onClick={() => onView(session)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
