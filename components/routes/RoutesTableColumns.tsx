import {
  MoreHorizontal,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Eye,
  Route,
  User,
  Calendar,
  TrendingUp,
  AlertCircle,
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
import { RiderRoute } from "@/schemas";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "assigned":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
          <Calendar className="h-3 w-3 mr-1" />
          Assigned
        </Badge>
      );
    case "in-progress":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Clock className="h-3 w-3 mr-1" />
          In Progress
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800">
          <XCircle className="h-3 w-3 mr-1" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

const getPerformanceBadge = (performance: string) => {
  switch (performance) {
    case "high":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
          <TrendingUp className="h-3 w-3 mr-1" />
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300">
          <AlertCircle className="h-3 w-3 mr-1" />
          Medium
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300">
          <AlertCircle className="h-3 w-3 mr-1" />
          Low
        </Badge>
      );
    default:
      return <Badge variant="secondary">{performance}</Badge>;
  }
};

interface RoutesTableColumnsProps {
  onEdit?: (route: RiderRoute) => void;
  onView?: (route: RiderRoute) => void;
  onDelete?: (route: RiderRoute) => void;
  onApprove?: (route: RiderRoute) => void;
  onReject?: (route: RiderRoute) => void;
}

export function getRoutesTableColumns({
  onEdit,
  onView,
  onDelete,
  onApprove,
  onReject,
}: RoutesTableColumnsProps = {}): ColumnDef<RiderRoute>[] {
  return [
    {
      accessorKey: "name",
      header: "Route Name",
      cell: ({ row }) => {
        const route = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{route.name}</span>
            {route.brand && (
              <span className="text-xs text-muted-foreground">{route.brand}</span>
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
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => {
        const route = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{route.city}</span>
            <span className="text-xs text-muted-foreground">{route.zone}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "assignedRiderId",
      header: "Rider",
      cell: ({ row }) => {
        const riders = row.original.assignedRiderId;
        if (!riders || riders.length === 0) {
          return <span className="text-muted-foreground">Unassigned</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm">{riders.length} rider(s)</span>
          </div>
        );
      },
    },
    {
      accessorKey: "performance",
      header: "Performance",
      cell: ({ row }) => getPerformanceBadge(row.original.performance),
    },
    {
      accessorKey: "coverage",
      header: "Compliance",
      cell: ({ row }) => {
        const coverage = row.original.coverage;
        if (coverage === undefined) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{coverage}%</span>
            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  coverage >= 90
                    ? "bg-green-500"
                    : coverage >= 70
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${coverage}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "estimatedDuration",
      header: "Duration",
      cell: ({ row }) => {
        const route = row.original;
        if (route.completionTime) {
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium">{route.completionTime} min</span>
              <span className="text-xs text-muted-foreground">Actual</span>
            </div>
          );
        }
        return <span className="text-sm">{route.estimatedDuration}</span>;
      },
    },
    {
      accessorKey: "assignedDate",
      header: "Assigned",
      cell: ({ row }) => {
        const date = row.original.assignedDate;
        if (!date) return <span className="text-muted-foreground">—</span>;
        try {
          const dateObj = new Date(date);
          return (
            <div className="flex flex-col">
              <span className="text-sm">{format(dateObj, "MMM d, yyyy")}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(dateObj, { addSuffix: true })}
              </span>
            </div>
          );
        } catch {
          return <span className="text-sm">{date}</span>;
        }
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const route = row.original;

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
                <DropdownMenuItem onClick={() => onView(route)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(route)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Route
                </DropdownMenuItem>
              )}
              {onApprove && route.status !== "completed" && route.status !== "cancelled" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onApprove(route)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve Route
                  </DropdownMenuItem>
                </>
              )}
              {onReject && route.status !== "completed" && route.status !== "cancelled" && (
                <DropdownMenuItem
                  onClick={() => onReject(route)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Route
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(route)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Route
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
