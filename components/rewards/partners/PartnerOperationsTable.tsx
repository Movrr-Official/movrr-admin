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
import { Checkbox } from "@/components/ui/checkbox";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  assessPartnerReadiness,
  formatOrganisationStatus,
  formatPartnerReadiness,
  getOrganisationStatusPresentation,
  getPartnerReadinessPresentation,
} from "@/features/organisations/presentation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";

type PartnerOperationsTableProps = {
  rows: Organisation[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string, selected: boolean) => void;
  onToggleSelectAll: (selected: boolean) => void;
  onSelectPartner: (org: Organisation) => void;
  emptyAction?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function PartnerOperationsTable({
  rows,
  isLoading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSelectPartner,
  emptyAction,
  emptyTitle = "No reward partners yet",
  emptyDescription = "Fulfilment needs Reward Partners — create the first partner to enable collection and validation capacity.",
}: PartnerOperationsTableProps) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading partners…
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

  const allSelected = rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  return (
    <Table>
      <caption className="sr-only">
        Reward partners with fulfilment readiness, status, staffing, and contact
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(value) => onToggleSelectAll(value === true)}
              aria-label="Select all partners on this page"
            />
          </TableHead>
          <TableHead>Partner</TableHead>
          <TableHead>Readiness</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Staffing</TableHead>
          <TableHead>Contact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const assessment = assessPartnerReadiness(row);
          const readiness = getPartnerReadinessPresentation(assessment.readiness);
          const status = getOrganisationStatusPresentation(row.status);
          const contact =
            row.partnerProfile?.contactEmail?.trim() || "Missing";
          const displayName =
            row.partnerProfile?.name?.trim() || row.name;

          return (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => onSelectPartner(row)}
              data-state={selectedIds.has(row.id) ? "selected" : undefined}
            >
              <TableCell
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={(value) =>
                    onToggleSelect(row.id, value === true)
                  }
                  aria-label={`Select ${displayName}`}
                />
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {displayName}
                </span>
                <p className="text-xs font-mono text-muted-foreground">
                  {row.id}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={readiness.badgeVariant}>
                  {formatPartnerReadiness(assessment.readiness)}
                </Badge>
                {assessment.reasons[0] ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {assessment.reasons[0]}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={status.badgeVariant}>
                  {formatOrganisationStatus(row.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">
                {assessment.missingStaff ? (
                  <span className="text-destructive">Missing staff</span>
                ) : (
                  <span>
                    {row.activeMemberCount ?? 0} active
                    {(row.memberCount ?? 0) > (row.activeMemberCount ?? 0)
                      ? ` / ${row.memberCount} total`
                      : ""}
                  </span>
                )}
              </TableCell>
              <TableCell
                className={
                  contact === "Missing"
                    ? "text-sm text-amber-700 dark:text-amber-400"
                    : "text-sm text-muted-foreground"
                }
              >
                {contact}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
