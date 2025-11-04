import {
  MoreHorizontal,
  Bike,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { WaitlistEntry } from "@/types/types";

const getBikeOwnershipBadge = (ownership: string) => {
  switch (ownership) {
    case "yes":
      return (
        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-medium">
          <Bike className="h-3 w-3 mr-1" />
          Owns Bike
        </Badge>
      );
    case "no":
      return (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground hover:bg-muted/80 font-medium"
        >
          No Bike
        </Badge>
      );
    case "planning":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        >
          Planning to Get
        </Badge>
      );
    default:
      return <Badge variant="secondary">{ownership}</Badge>;
  }
};

interface WaitlistTableColumnsProps {
  onStatusUpdate?: (entry: WaitlistEntry) => void;
}

export const getWaitlistTableColumns = ({
  onStatusUpdate,
}: WaitlistTableColumnsProps = {}): ColumnDef<WaitlistEntry>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return (
        <div>
          <div className="font-semibold text-foreground">
            {row.original.name}
          </div>
          <div className="text-sm text-muted-foreground sm:hidden">
            {row.original.email}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <div className="text-muted-foreground font-medium">
        {row.getValue("email")}
      </div>
    ),
  },
  {
    accessorKey: "city",
    header: "City",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
      >
        {row.getValue("city")}
      </Badge>
    ),
  },
  {
    accessorKey: "bike_ownership",
    header: "Bike Status",
    cell: ({ row }) => getBikeOwnershipBadge(row.getValue("bike_ownership")),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      switch (status) {
        case "approved":
          return (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
              <CheckCircle className="h-3 w-3 mr-1" />
              Approved
            </Badge>
          );
        case "pending":
          return (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
            >
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          );
        case "rejected":
          return (
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Rejected
            </Badge>
          );
        default:
          return <Badge variant="secondary">{status}</Badge>;
      }
    },
  },
  {
    accessorKey: "created_at",
    header: "Signup Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return (
        <div className="text-muted-foreground font-medium">
          {date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "2-digit",
          })}
        </div>
      );
    },
  },
  // Actions column
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const entry = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="glass-card border-border/30"
          >
            <DropdownMenuItem onClick={() => onStatusUpdate?.(entry)}>
              Update Status
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/30" />
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(entry.email);
              }}
              className="text-xs"
            >
              Copy Email
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

// Keep backward compatibility - export the default columns as well
export const columns = getWaitlistTableColumns();
