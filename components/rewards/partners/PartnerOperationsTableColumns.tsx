"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Mail, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  assessPartnerReadiness,
  formatOrganisationStatus,
  formatPartnerReadiness,
  getOrganisationStatusPresentation,
  getPartnerReadinessPresentation,
  type PartnerReadiness,
} from "@/features/organisations/presentation";

export type PartnerOpsRow = Organisation & {
  readiness: PartnerReadiness;
  staffing: "missing" | "staffed";
  profileCompleteness: "incomplete" | "complete";
  displayName: string;
  contactEmail: string;
};

type PartnerOperationsTableColumnsProps = {
  onView?: (partner: PartnerOpsRow) => void;
};

export function getPartnerOperationsTableColumns({
  onView,
}: PartnerOperationsTableColumnsProps = {}): ColumnDef<PartnerOpsRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all partners on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.displayName}`}
          onClick={(event) => event.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "displayName",
      header: "Partner",
      cell: ({ row }) => {
        const partner = row.original;
        return (
          <div className="min-w-[200px]">
            <span className="text-sm font-medium text-primary">
              {partner.displayName}
            </span>
            <p className="text-xs font-mono text-muted-foreground">
              {partner.id}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "readiness",
      header: "Readiness",
      cell: ({ row }) => {
        const assessment = assessPartnerReadiness(row.original);
        const readiness = getPartnerReadinessPresentation(assessment.readiness);
        return (
          <div>
            <Badge variant={readiness.badgeVariant}>
              {formatPartnerReadiness(assessment.readiness)}
            </Badge>
            {assessment.reasons[0] ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {assessment.reasons[0]}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = getOrganisationStatusPresentation(row.original.status);
        return (
          <Badge variant={status.badgeVariant}>
            {formatOrganisationStatus(row.original.status)}
          </Badge>
        );
      },
    },
    {
      id: "staffing",
      accessorKey: "staffing",
      header: "Staffing",
      cell: ({ row }) => {
        const assessment = assessPartnerReadiness(row.original);
        if (assessment.missingStaff) {
          return (
            <span className="text-sm text-destructive">Missing staff</span>
          );
        }
        return (
          <span className="text-sm">
            {row.original.activeMemberCount ?? 0} active
            {(row.original.memberCount ?? 0) >
            (row.original.activeMemberCount ?? 0)
              ? ` / ${row.original.memberCount} total`
              : ""}
          </span>
        );
      },
    },
    {
      accessorKey: "contactEmail",
      header: "Contact",
      cell: ({ row }) => {
        const contact = row.original.contactEmail.trim();
        if (!contact) {
          return (
            <span className="text-sm text-amber-700 dark:text-amber-400">
              Missing
            </span>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[200px]">{contact}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
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
                onView?.(row.original);
              }}
            >
              View partner
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
    },
  ];
}
