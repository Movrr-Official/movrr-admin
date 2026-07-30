"use client";

import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ResourcePoolReadModel } from "@/hooks/useResourcePoolsData";
import {
  deriveResourcePoolHealth,
  formatResourceKind,
  formatResourcePoolHealth,
  getResourcePoolHealthPresentation,
} from "@/features/fulfilment/presentation";

type ResourcePoolTableProps = {
  rows: ResourcePoolReadModel[];
  isLoading: boolean;
};

/** Compact pool table for dashboard previews. Full ops list uses ResourcePoolsTablePanel. */
export function ResourcePoolTable({ rows, isLoading }: ResourcePoolTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading resource pools…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No resource pools returned from Platform API yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pool</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead className="text-right">Available</TableHead>
          <TableHead>Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const health = deriveResourcePoolHealth(row);
          const healthPresentation = getResourcePoolHealthPresentation(health);
          return (
            <TableRow key={row.id}>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {row.name?.trim() || "Unnamed pool"}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {row.id}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {formatResourceKind(row.resourceKind)}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {row.availableCount ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={healthPresentation.badgeVariant}>
                  {formatResourcePoolHealth(health)}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
