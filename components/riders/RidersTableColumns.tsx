import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bike,
  Coins,
  Eye,
  Mail,
  MapPin,
  MoreHorizontal,
  Route,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";

import { Rider } from "@/schemas";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getStatusBadge = (status: Rider["status"]) => {
  if (status === "active") {
    return (
      <Badge variant="success">
        <UserCheck className="mr-1 h-3 w-3" />
        Active
      </Badge>
    );
  }

  if (status === "pending") {
    return <Badge variant="info">Pending</Badge>;
  }

  return (
    <Badge variant="warning">
      <UserX className="mr-1 h-3 w-3" />
      Inactive
    </Badge>
  );
};

interface RidersTableColumnsProps {
  onView?: (rider: Rider) => void;
}

export const getRidersTableColumns = ({
  onView,
}: RidersTableColumnsProps = {}): ColumnDef<Rider>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Rider",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <div className="flex min-w-[240px] items-start gap-3">
          <Avatar className="h-10 w-10 border border-border/50">
            <AvatarImage src={rider.avatarUrl} alt={rider.name} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {rider.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {rider.name}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{rider.email}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Rider ID: {rider.id.slice(0, 8)}
            </p>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "city",
    header: "Location",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <div className="min-w-[150px] space-y-1 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{rider.city || "No city"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {rider.country || "No country"}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-col space-y-2">
        {getStatusBadge(row.original.status)}
        <Badge variant={row.original.isVerified ? "success" : "destructive"}>
          <ShieldCheck className="mr-1 h-3 w-3" />
          {row.original.isVerified ? "Verified" : "Unverified"}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "activeRoutesCount",
    header: "Operations",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <div className="min-w-[150px] space-y-1 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Route className="h-3.5 w-3.5 text-primary" />
            <span>{rider.activeRoutesCount} active routes</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Bike className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">
              {rider.activeCampaignsCount} campaign rides
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "pointsBalance",
    header: "Rewards",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <div className="min-w-[130px] space-y-1">
          <div className="flex items-center gap-2 text-foreground">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{rider.pointsBalance}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {rider.totalRides} total rides
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "lastActivityAt",
    header: "Last Active",
    cell: ({ row }) => {
      const lastActivityAt =
        row.original.lastActivityAt ?? row.original.lastActive;
      if (!lastActivityAt) {
        return (
          <div className="min-w-[130px]">
            <p className="text-sm font-medium text-muted-foreground">Never</p>
            <p className="text-xs text-muted-foreground">
              No recorded activity
            </p>
          </div>
        );
      }

      const activityDate = new Date(lastActivityAt);
      if (Number.isNaN(activityDate.getTime())) {
        return (
          <div className="min-w-[130px]">
            <p className="text-sm font-medium text-muted-foreground">Unknown</p>
            <p className="text-xs text-muted-foreground">
              Invalid activity timestamp
            </p>
          </div>
        );
      }

      return (
        <div className="min-w-[130px]">
          <p className="text-sm font-medium text-foreground">
            {format(activityDate, "MMM d, yyyy")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(activityDate, { addSuffix: true })}
          </p>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const rider = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView?.(rider)}>
              <Eye className="mr-2 h-4 w-4" />
              View rider
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
