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
import { Button } from "@/components/ui/button";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  formatOrganisationStatus,
  formatOrganisationType,
  getOrganisationStatusPresentation,
  getOrganisationTypePresentation,
} from "@/features/organisations/presentation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

type OrganisationsDirectoryTableProps = {
  rows: Organisation[];
  isLoading: boolean;
  onSelectOrg: (org: Organisation) => void;
  emptyAction?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function OrganisationsDirectoryTable({
  rows,
  isLoading,
  onSelectOrg,
  emptyAction,
  emptyTitle = "No organisations yet",
  emptyDescription = "Provision the first platform institution to establish tenancy.",
}: OrganisationsDirectoryTableProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading organisations…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <OpsEmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <Table>
      <caption className="sr-only">
        Platform organisations with type, status, and membership summary
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead>Organisation</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Members</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const type = getOrganisationTypePresentation(row.type);
          const status = getOrganisationStatusPresentation(row.status);
          const members = row.memberCount ?? 0;

          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => onSelectOrg(row)}
            >
              <TableCell>
                <span className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {row.name}
                </span>
                <p className="text-xs font-mono text-muted-foreground">
                  {row.id}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={type.badgeVariant}>
                  {formatOrganisationType(row.type)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={status.badgeVariant}>
                  {formatOrganisationStatus(row.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                {members < 1 ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    No members
                  </span>
                ) : (
                  <span>
                    {members}
                    {typeof row.activeMemberCount === "number"
                      ? ` (${row.activeMemberCount} active)`
                      : ""}
                  </span>
                )}
              </TableCell>
              <TableCell
                className="text-right"
                onClick={(event) => event.stopPropagation()}
              >
                {row.type === "reward_partner" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={FULFILMENT_ROUTES.partnerDetail(row.id)}>
                      Partner readiness
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectOrg(row)}
                  >
                    Open
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
