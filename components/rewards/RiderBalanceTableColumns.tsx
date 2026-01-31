import {
  MoreHorizontal,
  Coins,
  TrendingUp,
  TrendingDown,
  Eye,
  Edit,
  User,
  Calendar,
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
import { RiderBalance } from "@/schemas";

interface RiderBalanceTableColumnsProps {
  onView?: (balance: RiderBalance) => void;
  onAdjust?: (balance: RiderBalance) => void;
}

export function getRiderBalanceTableColumns({
  onView,
  onAdjust,
}: RiderBalanceTableColumnsProps = {}): ColumnDef<RiderBalance>[] {
  return [
    {
      accessorKey: "riderName",
      header: "Rider",
      cell: ({ row }) => {
        const balance = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{balance.riderName}</span>
            <span className="text-xs text-muted-foreground">{balance.riderEmail}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "riderId",
      header: "Rider ID",
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
      accessorKey: "currentBalance",
      header: "Current Balance",
      cell: ({ row }) => {
        const balance = row.original.currentBalance;
        return (
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold">{balance.toLocaleString()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "totalPointsAwarded",
      header: "Total Awarded",
      cell: ({ row }) => {
        const points = row.original.totalPointsAwarded;
        return (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">
              {points.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "totalPointsRedeemed",
      header: "Total Redeemed",
      cell: ({ row }) => {
        const points = row.original.totalPointsRedeemed;
        return (
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">
              {points.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "lastTransactionDate",
      header: "Last Transaction",
      cell: ({ row }) => {
        const date = row.original.lastTransactionDate;
        if (!date) return <span className="text-muted-foreground">—</span>;
        try {
          const dateObj = new Date(date);
          return (
            <div className="flex flex-col">
              <span className="text-sm">{format(dateObj, "MMM d, yyyy")}</span>
              <span className="text-xs text-muted-foreground">{format(dateObj, "HH:mm")}</span>
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
        const balance = row.original;

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
                <DropdownMenuItem onClick={() => onView(balance)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
              )}
              {onAdjust && (
                <DropdownMenuItem onClick={() => onAdjust(balance)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Adjust Points
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
