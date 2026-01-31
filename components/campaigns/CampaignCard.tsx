"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Play,
  Pause,
  Edit,
  Trash2,
  Calendar,
  Copy,
  Eye,
  MousePointerClick,
  TrendingUp,
  MapPin,
  Clock,
  Target,
} from "lucide-react";
import { Campaign } from "@/schemas";
import { format } from "date-fns";

interface CampaignCardProps {
  campaign: Campaign;
  onEdit?: (campaign: Campaign) => void;
  onStatusChange?: (campaign: Campaign) => void;
  onView?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
  onDuplicate?: (campaign: Campaign) => void;
}

export function CampaignCard({
  campaign,
  onEdit,
  onStatusChange,
  onView,
  onDelete,
  onDuplicate,
}: CampaignCardProps) {
  // Map status to badge colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
      case "paused":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
      case "completed":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
      case "cancelled":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
      case "draft":
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800";
    }
  };

  const handleStatusChange = () => {
    onStatusChange?.(campaign);
  };

  const handleEdit = () => {
    onEdit?.(campaign);
  };

  const handleView = () => {
    onView?.(campaign);
  };

  const handleDelete = () => {
    onDelete?.(campaign);
  };

  const handleDuplicate = () => {
    onDuplicate?.(campaign);
  };

  // Calculate progress percentage with safe division
  const percentSpent = campaign.budget > 0
    ? campaign.progress ?? Math.min((campaign.spent / campaign.budget) * 100, 100)
    : 0;
  
  // Format dates - handle both ISO strings and YYYY-MM-DD format
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "N/A";
    try {
      // If it's already a valid date string, parse it
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return format(date, "MMM d, yyyy");
      }
      // Try parsing as YYYY-MM-DD
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const [year, month, day] = parts;
        const parsedDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(parsedDate.getTime())) {
          return format(parsedDate, "MMM d, yyyy");
        }
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };
  
  const startDate = formatDate(campaign.startDate);
  const endDate = formatDate(campaign.endDate);

  return (
      <Card className="h-full glass-card border-0 overflow-hidden relative">
        {/* Header */}
        <CardHeader className="flex items-center justify-between pb-3">
          <div className="flex-1 space-y-2 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">
              {campaign.name}
            </CardTitle>
            {campaign.brand && (
              <p className="text-sm text-muted-foreground truncate">
                {campaign.brand}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={getStatusColor(campaign.status)}>
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {campaign.campaignType}
              </Badge>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                aria-label="Campaign actions menu"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleView}>
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              {campaign.status === "active" ? (
                <DropdownMenuItem onClick={handleStatusChange}>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </DropdownMenuItem>
              ) : campaign.status === "paused" ? (
                <DropdownMenuItem onClick={handleStatusChange}>
                  <Play className="w-4 h-4 mr-2" />
                  Activate
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        {/* Body */}
        <CardContent className="space-y-4">
          {/* Budget & Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Budget:</span>
              <span className="font-semibold">
                €{typeof campaign.budget === "number" 
                  ? campaign.budget.toLocaleString() 
                  : "0"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spent:</span>
              <span className="font-semibold">
                €{typeof campaign.spent === "number" 
                  ? campaign.spent.toLocaleString() 
                  : "0"}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, percentSpent)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{percentSpent.toFixed(1)}% spent</span>
              <span>
                {typeof campaign.progress === "number" 
                  ? `${campaign.progress.toFixed(1)}%` 
                  : "0%"} progress
              </span>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/30 p-2 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Impressions</span>
              </div>
              <div className="text-sm font-semibold">
                {typeof campaign.impressions === "number" 
                  ? campaign.impressions.toLocaleString() 
                  : "0"}
              </div>
            </div>
            <div className="bg-muted/30 p-2 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">CTR</span>
              </div>
              <div className="text-sm font-semibold">
                {typeof campaign.ctr === "number" ? campaign.ctr.toFixed(2) : "0.00"}%
              </div>
            </div>
            <div className="bg-muted/30 p-2 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">ROI</span>
              </div>
              <div className="text-sm font-semibold">
                {typeof campaign.roi === "number" ? campaign.roi.toFixed(2) : "0.00"}x
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" />
                Routes
              </span>
              <span className="font-medium">{campaign.routes?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Clicks
              </span>
              <span className="font-medium">
                {typeof campaign.clicks === "number" ? campaign.clicks.toLocaleString() : "0"}
              </span>
            </div>
          </div>

          {/* Location & Vehicle */}
          <div className="space-y-2 text-sm border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Top City
              </span>
              <span className="font-medium">{campaign.topCity || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vehicle Type</span>
              <span className="font-medium capitalize">
                {campaign.vehicleTypeRequired?.replace(/-/g, " ") || "N/A"}
              </span>
            </div>
            {campaign.targetZones && campaign.targetZones.length > 0 && (
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground text-xs">Zones:</span>
                <span className="font-medium text-xs text-right">
                  {campaign.targetZones.slice(0, 2).join(", ")}
                  {campaign.targetZones.length > 2 && ` +${campaign.targetZones.length - 2}`}
                </span>
              </div>
            )}
          </div>

          {/* Date Range */}
          <div className="text-xs border-t pt-3 space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{startDate} - {endDate}</span>
            </div>
            {campaign.targetAudience && (
              <div className="text-muted-foreground">
                Audience: <span className="font-medium">{campaign.targetAudience}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
  );
}
