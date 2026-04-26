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

const getBikeOwnershipBadge = (ownership: string | null) => {
  switch (ownership) {
    case "own":
      return (
        <Badge variant="default">
          <Bike className="h-3 w-3 mr-1" />
          Owns Bike
        </Badge>
      );
    case "interested":
      return (
        <Badge
          variant="secondary"
          className="border-slate-500/25 bg-gradient-to-tl from-slate-700 via-slate-600 to-slate-500 text-white shadow-slate-900/20 hover:from-slate-700 hover:to-slate-500 dark:border-slate-400/25 dark:from-slate-500 dark:via-slate-400 dark:to-slate-300 dark:text-slate-950 font-medium"
        >
          Interested
        </Badge>
      );
    case "planning":
      return <Badge variant="info">Planning to Get</Badge>;
    case null:
    case undefined:
      return <span className="text-xs text-muted-foreground">—</span>;
    default:
      return <Badge variant="secondary">{ownership}</Badge>;
  }
};

const getAudienceBadge = (audience: string | null) => {
  switch (audience) {
    case "rider":
      return <Badge variant="success">Rider</Badge>;
    case "brand":
      return <Badge variant="info">Brand</Badge>;
    case "partner":
      return <Badge variant="warning">Partner</Badge>;
    default:
      return <span className="text-xs text-muted-foreground">—</span>;
  }
};

const getSourceBadge = (source: string | null) => {
  switch (source) {
    case "movrr_website":
      return (
        <Badge variant="default" className="font-medium text-xs">
          Website
        </Badge>
      );
    case "movrr_waitlist":
      return (
        <Badge variant="secondary" className="font-medium text-xs">
          Waitlist
        </Badge>
      );
    default:
      return <span className="text-xs text-muted-foreground">—</span>;
  }
};

const getChannelBadge = (channel: string | null) => {
  if (!channel) return <span className="text-xs text-muted-foreground">—</span>;
  const labels: Record<string, string> = {
    paid: "Paid",
    social: "Social",
    organic_search: "Organic",
    email: "Email",
    partner: "Partner",
    referral: "Referral",
    direct: "Direct",
  };
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {labels[channel] ?? channel}
    </span>
  );
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
    cell: ({ row }) => <Badge variant="info">{row.getValue("city")}</Badge>,
  },
  {
    accessorKey: "audience",
    header: "Audience",
    cell: ({ row }) => getAudienceBadge(row.getValue("audience")),
  },
  {
    accessorKey: "bike_ownership",
    header: "Bike",
    cell: ({ row }) => getBikeOwnershipBadge(row.getValue("bike_ownership")),
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => getSourceBadge(row.getValue("source")),
  },
  {
    accessorKey: "acquisition_channel",
    header: "Channel",
    cell: ({ row }) => getChannelBadge(row.getValue("acquisition_channel")),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      switch (status) {
        case "approved":
          return (
            <Badge variant="success">
              <CheckCircle className="h-3 w-3 mr-1" />
              Approved
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
