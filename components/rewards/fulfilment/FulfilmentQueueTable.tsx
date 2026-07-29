"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FulfilmentReadModel } from "@/features/fulfilment/application/queries/fulfilmentQueries";
import { FulfilmentStateBadge } from "@/components/fulfilment/FulfilmentStateBadge";
import { FulfilmentTypeBadge } from "@/components/fulfilment/FulfilmentTypeBadge";
import {
  formatRiderProgress,
} from "@/features/fulfilment/presentation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

type FulfilmentQueueTableProps = {
  rows: FulfilmentReadModel[];
  isLoading: boolean;
};

export function FulfilmentQueueTable({
  rows,
  isLoading,
}: FulfilmentQueueTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading fulfilment queue…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No fulfilments match the current filters.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">Version</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">
              <Link
                href={FULFILMENT_ROUTES.detail(row.id)}
                className="text-primary underline-offset-4 hover:underline"
              >
                {row.id}
              </Link>
            </TableCell>
            <TableCell>
              <FulfilmentStateBadge state={row.state} />
            </TableCell>
            <TableCell>
              <FulfilmentTypeBadge type={row.fulfilmentType} />
            </TableCell>
            <TableCell className="text-sm">
              {formatRiderProgress(row.progress)}
            </TableCell>
            <TableCell className="text-sm">{row.outcome ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs">
              {row.partnerOrgId ?? "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-xs">
              {row.version}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
