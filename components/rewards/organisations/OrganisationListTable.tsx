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
import { Badge } from "@/components/ui/badge";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  formatOrganisationStatus,
  formatOrganisationType,
  getOrganisationStatusPresentation,
  getOrganisationTypePresentation,
} from "@/features/organisations/presentation";

type OrganisationListTableProps = {
  rows: Organisation[];
  isLoading: boolean;
  /** Prefer onSelectOrg for drawer UX; detailHref kept for external nav (e.g. dashboard). */
  onSelectOrg?: (org: Organisation) => void;
  detailHref?: (org: Organisation) => string;
};

export function OrganisationListTable({
  rows,
  isLoading,
  onSelectOrg,
  detailHref,
}: OrganisationListTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading organisations…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No organisations returned from Platform API yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = !onSelectOrg ? detailHref?.(row) : undefined;
          const selectable = Boolean(onSelectOrg);

          return (
            <TableRow
              key={row.id}
              className={selectable ? "cursor-pointer" : undefined}
              onClick={
                selectable
                  ? () => {
                      onSelectOrg?.(row);
                    }
                  : undefined
              }
            >
              <TableCell>
                {href ? (
                  <Link
                    href={href}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span
                    className={
                      selectable
                        ? "text-sm font-medium text-primary underline-offset-4 hover:underline"
                        : "text-sm font-medium"
                    }
                  >
                    {row.name}
                  </span>
                )}
                <p className="text-xs font-mono text-muted-foreground">
                  {row.id}
                </p>
              </TableCell>
              <TableCell>
                <Badge
                  variant={getOrganisationTypePresentation(row.type).badgeVariant}
                >
                  {formatOrganisationType(row.type)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    getOrganisationStatusPresentation(row.status).badgeVariant
                  }
                >
                  {formatOrganisationStatus(row.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
