"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import { FulfilmentStateBadge } from "@/components/fulfilment/FulfilmentStateBadge";
import { FulfilmentTypeBadge } from "@/components/fulfilment/FulfilmentTypeBadge";
import {
  formatRiderProgress,
  humanizeEnumToken,
} from "@/features/fulfilment/presentation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export type FulfilmentQueueRow = FulfilmentReadModel & {
  /** Alias for API/URL filter key `status` */
  status: FulfilmentReadModel["state"];
  /** Alias for API/URL filter key `type` */
  type: FulfilmentReadModel["fulfilmentType"];
  partnerLabel: string;
};

type FulfilmentQueueTableColumnsProps = {
  onView?: (row: FulfilmentQueueRow) => void;
};

export function toFulfilmentQueueRows(
  rows: FulfilmentReadModel[],
  partnerNames: Record<string, string> = {},
): FulfilmentQueueRow[] {
  return rows.map((row) => ({
    ...row,
    status: row.state,
    type: row.fulfilmentType,
    partnerLabel: row.partnerOrgId
      ? (partnerNames[row.partnerOrgId] ?? "Partner organisation")
      : "Unassigned",
  }));
}

export function getFulfilmentQueueTableColumns({
  onView,
}: FulfilmentQueueTableColumnsProps = {}): ColumnDef<FulfilmentQueueRow>[] {
  return [
    {
      accessorKey: "id",
      header: "Fulfilment",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="min-w-[180px]">
            <Link
              href={FULFILMENT_ROUTES.detail(item.id)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {item.id.slice(0, 8)}…
            </Link>
            <p className="text-xs font-mono text-muted-foreground">{item.id}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "State",
      cell: ({ row }) => <FulfilmentStateBadge state={row.original.state} />,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <FulfilmentTypeBadge type={row.original.fulfilmentType} />
      ),
    },
    {
      accessorKey: "progress",
      header: "Progress",
      cell: ({ row }) => (
        <span className="text-sm">
          {formatRiderProgress(row.original.progress)}
        </span>
      ),
    },
    {
      accessorKey: "outcome",
      header: "Outcome",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.outcome
            ? humanizeEnumToken(row.original.outcome)
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "partnerLabel",
      header: "Partner",
      cell: ({ row }) => {
        const item = row.original;
        if (!item.partnerOrgId) {
          return (
            <span className="text-sm text-muted-foreground">Unassigned</span>
          );
        }
        return (
          <div className="min-w-[140px]">
            <Link
              href={FULFILMENT_ROUTES.partnerDetail(item.partnerOrgId)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {item.partnerLabel}
            </Link>
            <p className="text-xs font-mono text-muted-foreground">
              {item.partnerOrgId}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "riderId",
      header: "Rider",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.riderId}
        </span>
      ),
    },
    {
      accessorKey: "version",
      header: "Ver",
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">
          {row.original.version}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
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
                  onView?.(item);
                }}
              >
                Open fulfilment
              </DropdownMenuItem>
              {item.partnerOrgId ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={FULFILMENT_ROUTES.partnerDetail(item.partnerOrgId)}
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
