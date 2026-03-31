import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bike,
  Clock,
  Coins,
  Eye,
  MapPin,
  Megaphone,
  MoreHorizontal,
  ShieldCheck,
  ShieldX,
  Timer,
  User,
} from "lucide-react";

import { RideSession } from "@/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getVerificationBadge = (status: RideSession["verificationStatus"]) => {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <ShieldX className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      );
    case "manual_review":
      return (
        <Badge className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 font-medium dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">
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
      <Badge className="bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 font-medium dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800">
        <Bike className="h-3 w-3 mr-1" />
        Free Ride
      </Badge>
    );
  }
  return (
    <Badge className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 font-medium dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
      <Megaphone className="h-3 w-3 mr-1" />
      Campaign Ride
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
            <span className="text-sm font-medium">{format(date, "MMM d, yyyy")}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(date, { addSuffix: true })}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "riderId",
      header: "Rider",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="h-3 w-3 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.original.riderName ?? "Unknown"}</span>
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
          <span className="text-sm font-medium">{row.original.verifiedMinutes} min</span>
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
        if (!campaignId) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Megaphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">{campaignName ?? campaignId.slice(0, 8)}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => {
        const { city, country } = row.original;
        if (!city && !country) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">{[city, country].filter(Boolean).join(", ")}</span>
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
            <DropdownMenuContent align="end" className="glass-card border-0 backdrop-blur-xl">
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
