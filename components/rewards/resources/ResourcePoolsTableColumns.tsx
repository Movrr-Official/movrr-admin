"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourcePoolReadModel } from "@/hooks/useResourcePoolsData";
import {
  deriveResourcePoolHealth,
  formatResourceKind,
  formatResourcePoolHealth,
  formatResourceStatus,
  getResourcePoolHealthPresentation,
  getResourceStatusPresentation,
  type ResourcePoolHealth,
} from "@/features/fulfilment/presentation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";
import Link from "next/link";

export type ResourcePoolRow = ResourcePoolReadModel & {
  displayName: string;
  inventoryHealth: ResourcePoolHealth;
  partnerLabel: string;
};

type ResourcePoolsTableColumnsProps = {
  onImport?: (pool: ResourcePoolRow) => void;
};

export function getResourcePoolsTableColumns({
  onImport,
}: ResourcePoolsTableColumnsProps = {}): ColumnDef<ResourcePoolRow>[] {
  return [
    {
      accessorKey: "displayName",
      header: "Pool",
      cell: ({ row }) => {
        const pool = row.original;
        return (
          <div className="min-w-[200px]">
            <span className="text-sm font-medium">{pool.displayName}</span>
            <p className="text-xs font-mono text-muted-foreground">{pool.id}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "resourceKind",
      header: "Kind",
      cell: ({ row }) => (
        <Badge variant="outline">
          {formatResourceKind(row.original.resourceKind)}
        </Badge>
      ),
    },
    {
      accessorKey: "partnerLabel",
      header: "Partner",
      cell: ({ row }) => {
        const pool = row.original;
        if (!pool.partnerOrgId) {
          return (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          );
        }
        return (
          <div className="min-w-[140px]">
            <Link
              href={FULFILMENT_ROUTES.partnerDetail(pool.partnerOrgId)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {pool.partnerLabel}
            </Link>
            <p className="text-xs font-mono text-muted-foreground">
              {pool.partnerOrgId}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "availableCount",
      header: "Available",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.availableCount ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "reservedCount",
      header: "Reserved",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.reservedCount ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "fulfilledCount",
      header: "Fulfilled",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.fulfilledCount ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = getResourceStatusPresentation(row.original.status);
        return (
          <Badge variant={status.badgeVariant}>
            {formatResourceStatus(row.original.status)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "inventoryHealth",
      header: "Health",
      cell: ({ row }) => {
        const health = getResourcePoolHealthPresentation(
          row.original.inventoryHealth,
        );
        return (
          <Badge variant={health.badgeVariant}>
            {formatResourcePoolHealth(row.original.inventoryHealth)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const pool = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onImport?.(pool);
                }}
              >
                Import codes
              </DropdownMenuItem>
              {pool.partnerOrgId ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={FULFILMENT_ROUTES.partnerDetail(pool.partnerOrgId)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open partner
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false,
    },
  ];
}

export function toResourcePoolRows(
  pools: ResourcePoolReadModel[],
  partnerNames: Record<string, string>,
): ResourcePoolRow[] {
  return pools.map((pool) => {
    const inventoryHealth = deriveResourcePoolHealth(pool);
    return {
      ...pool,
      displayName: pool.name?.trim() || "Unnamed pool",
      inventoryHealth,
      partnerLabel: pool.partnerOrgId
        ? (partnerNames[pool.partnerOrgId] ?? "Partner organisation")
        : "Unassigned",
    };
  });
}
