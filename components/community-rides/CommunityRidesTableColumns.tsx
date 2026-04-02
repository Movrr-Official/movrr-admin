import {
  MoreHorizontal,
  Eye,
  Trash2,
  XCircle,
  CheckCircle2,
  PlayCircle,
  Clock,
  Users,
  Gauge,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CommunityRide } from "@/schemas";

export const getStatusBadge = (status: string) => {
  switch (status) {
    case "upcoming":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
          <Clock className="h-3 w-3 mr-1" />
          Upcoming
        </Badge>
      );
    case "active":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <PlayCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-muted text-muted-foreground border-border font-medium">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export const getDifficultyBadge = (difficulty: string) => {
  switch (difficulty) {
    case "easy":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
          Easy
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300">
          Moderate
        </Badge>
      );
    case "challenging":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300">
          Challenging
        </Badge>
      );
    default:
      return <Badge variant="secondary">{difficulty}</Badge>;
  }
};

interface CommunityRidesTableColumnsProps {
  onView?: (ride: CommunityRide) => void;
  onDelete?: (ride: CommunityRide) => void;
  onCancel?: (ride: CommunityRide) => void;
}

export const getCommunityRidesTableColumns = ({
  onView,
  onDelete,
  onCancel,
}: CommunityRidesTableColumnsProps = {}): ColumnDef<CommunityRide>[] => [
  {
    accessorKey: "title",
    header: "Ride",
    cell: ({ row }) => {
      const ride = row.original;
      return (
        <div className="flex flex-col gap-1 min-w-[200px]">
          <div className="font-semibold text-foreground">{ride.title}</div>
          <div className="text-xs text-muted-foreground">
            by {ride.organizerName}
          </div>
          {ride.meetingPointName && (
            <div className="text-xs text-muted-foreground line-clamp-1">
              📍 {ride.meetingPointName}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.original.status),
  },
  {
    accessorKey: "difficulty",
    header: "Difficulty",
    cell: ({ row }) => getDifficultyBadge(row.original.difficulty),
  },
  {
    accessorKey: "scheduledAt",
    header: "Scheduled",
    cell: ({ row }) => {
      const d = new Date(row.original.scheduledAt);
      return (
        <div className="flex flex-col gap-1 min-w-[130px]">
          <span className="text-sm font-medium text-foreground">
            {format(d, "MMM d, yyyy")}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(d, "h:mm a")}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(d, { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "participantCount",
    header: "Participants",
    cell: ({ row }) => {
      const ride = row.original;
      const isFull = ride.participantCount >= ride.maxParticipants;
      return (
        <div className="flex flex-col gap-1 min-w-[100px]">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {ride.participantCount} / {ride.maxParticipants}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${isFull ? "bg-destructive" : "bg-primary"}`}
              style={{
                width: `${Math.min(100, (ride.participantCount / ride.maxParticipants) * 100)}%`,
              }}
            />
          </div>
          {isFull && (
            <span className="text-xs text-destructive font-medium">Full</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "difficulty",
    id: "difficulty_icon",
    header: "",
    cell: ({ row }) => {
      const ride = row.original;
      return (
        <div className="flex items-center gap-1">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground capitalize">
            {ride.difficulty}
          </span>
        </div>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => {
      const d = new Date(row.original.createdAt);
      return (
        <div className="flex flex-col gap-1 min-w-[110px]">
          <span className="text-sm font-medium text-foreground">
            {format(d, "MMM d, yyyy")}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(d, { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const ride = row.original;
      const canCancel = ride.status === "upcoming" || ride.status === "active";
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-0">
            <DropdownMenuItem onClick={() => onView?.(ride)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onCancel?.(ride)}
                  className="text-warning focus:text-warning"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Ride
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(ride)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Ride
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
