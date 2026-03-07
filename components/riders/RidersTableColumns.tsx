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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getStatusBadge = (status: Rider["status"]) => {
  if (status === "active") {
    return (
      <Badge className="bg-success/10 text-success border-success/30">
        <UserCheck className="mr-1 h-3 w-3" />
        Active
      </Badge>
    );
  }

  if (status === "pending") {
    return <Badge className="bg-info/10 text-info border-info/30">Pending</Badge>;
  }

  return (
    <Badge className="bg-warning/10 text-warning border-warning/30">
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
            <p className="truncate font-semibold text-foreground">{rider.name}</p>
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
      <div className="space-y-2">
        {getStatusBadge(row.original.status)}
        <Badge
          className={
            row.original.isVerified
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted text-muted-foreground border-border"
          }
        >
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
          <div className="flex items-center gap-2 text-foreground">
            <Bike className="h-3.5 w-3.5 text-primary" />
            <span>{rider.activeCampaignsCount} active campaigns</span>
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
            {rider.campaignsCompleted} campaigns completed
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ row }) => {
      const updatedAt = new Date(row.original.updatedAt);
      return (
        <div className="min-w-[130px]">
          <p className="text-sm font-medium text-foreground">
            {format(updatedAt, "MMM d, yyyy")}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(updatedAt, { addSuffix: true })}
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
