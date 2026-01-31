import {
  MoreHorizontal,
  PlayCircle,
  PauseCircle,
  FileText,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Eye,
  Megaphone,
  Target,
  DollarSign,
  TrendingUp,
  Eye as EyeIcon,
  MousePointerClick,
  Copy,
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
import { Campaign } from "@/schemas";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <PlayCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <PauseCircle className="h-3 w-3 mr-1" />
          Paused
        </Badge>
      );
    case "draft":
      return (
        <Badge className="bg-muted text-muted-foreground border-border hover:bg-muted/80 font-medium">
          <FileText className="h-3 w-3 mr-1" />
          Draft
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
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

const getTypeBadge = (type: string) => {
  switch (type) {
    case "destination_ride":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300">
          <Megaphone className="h-3 w-3 mr-1" />
          Destination Ride
        </Badge>
      );
    case "swarm":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
          <Target className="h-3 w-3 mr-1" />
          Swarm
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

interface CampaignsTableColumnsProps {
  onEdit?: (campaign: Campaign) => void;
  onStatusChange?: (campaign: Campaign) => void;
  onView?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
  onDuplicate?: (campaign: Campaign) => void;
}

export const getCampaignsTableColumns = ({
  onEdit,
  onStatusChange,
  onView,
  onDelete,
  onDuplicate,
}: CampaignsTableColumnsProps = {}): ColumnDef<Campaign>[] => [
  {
    accessorKey: "name",
    header: "Campaign",
    cell: ({ row }) => {
      const campaign = row.original;
      return (
        <div className="flex flex-col gap-1 min-w-[200px]">
          <div className="font-semibold text-foreground">{campaign.name}</div>
          {campaign.brand && (
            <div className="text-xs text-muted-foreground">
              {campaign.brand}
            </div>
          )}
          {campaign.description && (
            <div className="text-xs text-muted-foreground line-clamp-1">
              {campaign.description}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      return getStatusBadge(row.original.status);
    },
  },
  {
    accessorKey: "campaignType",
    header: "Type",
    cell: ({ row }) => {
      return getTypeBadge(row.original.campaignType);
    },
  },
  {
    accessorKey: "budget",
    header: "Budget",
    cell: ({ row }) => {
      const campaign = row.original;
      const spent = campaign.spent || 0;
      const budget = campaign.budget || 0;
      const remaining = budget - spent;
      const utilization = budget > 0 ? Math.round((spent / budget) * 100) : 0;

      return (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              ${spent.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">
              / ${budget.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, utilization)}%`,
              }}
            ></div>
          </div>
          <span className="text-xs text-muted-foreground">
            {utilization}% used
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "impressions",
    header: "Performance",
    cell: ({ row }) => {
      const campaign = row.original;
      const impressions = campaign.impressions || 0;
      const clicks = campaign.clicks || 0;
      const ctr = campaign.ctr || 0;
      const roi = campaign.roi || 0;

      return (
        <div className="flex flex-col gap-1 min-w-[140px]">
          <div className="flex items-center gap-2">
            <EyeIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {impressions.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {clicks.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">
              ({ctr.toFixed(1)}% CTR)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              ROI: {roi.toFixed(1)}x
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "progress",
    header: "Progress",
    cell: ({ row }) => {
      const progress = row.original.progress || 0;
      return (
        <div className="flex flex-col gap-1 min-w-[100px]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
              }}
            ></div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "startDate",
    header: "Dates",
    cell: ({ row }) => {
      const campaign = row.original;
      const startDate = new Date(campaign.startDate);
      const endDate = new Date(campaign.endDate);
      const now = new Date();
      const isActive = now >= startDate && now <= endDate;
      const isUpcoming = now < startDate;
      const isPast = now > endDate;

      return (
        <div className="flex flex-col gap-1 min-w-[140px]">
          <div className="text-sm font-medium text-foreground">
            {format(startDate, "MMM d, yyyy")}
          </div>
          <div className="text-xs text-muted-foreground">
            to {format(endDate, "MMM d, yyyy")}
          </div>
          {isActive && (
            <Badge className="w-fit bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300">
              Active
            </Badge>
          )}
          {isUpcoming && (
            <Badge className="w-fit bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-950 dark:text-blue-300">
              Upcoming
            </Badge>
          )}
          {isPast && (
            <Badge className="w-fit bg-muted text-muted-foreground border-border text-xs">
              Ended
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Last Updated",
    cell: ({ row }) => {
      const updatedAt = new Date(row.original.updatedAt);
      return (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="text-sm font-medium text-foreground">
            {format(updatedAt, "MMM d, yyyy")}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(updatedAt, { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const campaign = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-card border-0">
            <DropdownMenuItem onClick={() => onView?.(campaign)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit?.(campaign)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Campaign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onStatusChange?.(campaign)}
              disabled={
                campaign.status === "completed" ||
                campaign.status === "cancelled"
              }
            >
              {campaign.status === "active" ? (
                <>
                  <PauseCircle className="mr-2 h-4 w-4" />
                  Pause Campaign
                </>
              ) : campaign.status === "paused" ? (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Resume Campaign
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Activate Campaign
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDuplicate?.(campaign)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate Campaign
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete?.(campaign)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Campaign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
