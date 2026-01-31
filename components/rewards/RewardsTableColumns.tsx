import {
  MoreHorizontal,
  Coins,
  TrendingUp,
  TrendingDown,
  Edit,
  Eye,
  Calendar,
  User,
  Megaphone,
  Route,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RewardTransaction } from "@/schemas";

const getTransactionTypeBadge = (type: string) => {
  switch (type) {
    case "awarded":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 font-medium dark:bg-green-950 dark:text-green-300 dark:border-green-800">
          <TrendingUp className="h-3 w-3 mr-1" />
          Awarded
        </Badge>
      );
    case "redeemed":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
          <TrendingDown className="h-3 w-3 mr-1" />
          Redeemed
        </Badge>
      );
    case "adjusted":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 font-medium dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
          <Edit className="h-3 w-3 mr-1" />
          Adjusted
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

interface RewardsTableColumnsProps {
  onView?: (transaction: RewardTransaction) => void;
}

export function getRewardsTableColumns({
  onView,
}: RewardsTableColumnsProps = {}): ColumnDef<RewardTransaction>[] {
  return [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => {
        const date = row.original.createdAt;
        try {
          const dateObj = new Date(date);
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium">{format(dateObj, "MMM d, yyyy")}</span>
              <span className="text-xs text-muted-foreground">{format(dateObj, "HH:mm")}</span>
            </div>
          );
        } catch {
          return <span className="text-sm">{date}</span>;
        }
      },
    },
    {
      accessorKey: "riderId",
      header: "Rider",
      cell: ({ row }) => {
        const riderId = row.original.riderId;
        return (
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-mono">{riderId}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => getTransactionTypeBadge(row.original.type),
    },
    {
      accessorKey: "points",
      header: "Points",
      cell: ({ row }) => {
        const points = row.original.points;
        const isPositive = points > 0;
        return (
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span
              className={`text-sm font-semibold ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {points.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "balanceAfter",
      header: "Balance After",
      cell: ({ row }) => {
        const balance = row.original.balanceAfter;
        return (
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium">{balance.toLocaleString()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "campaignId",
      header: "Campaign",
      cell: ({ row }) => {
        const campaignId = row.original.campaignId;
        if (!campaignId) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Megaphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-mono">{campaignId}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "routeId",
      header: "Route",
      cell: ({ row }) => {
        const routeId = row.original.routeId;
        if (!routeId) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Route className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-mono">{routeId}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const description = row.original.description;
        return (
          <span className="text-sm text-muted-foreground">
            {description || "—"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const transaction = row.original;

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
                <DropdownMenuItem onClick={() => onView(transaction)}>
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
