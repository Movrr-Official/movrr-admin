"use client";

import Link from "next/link";
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
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  formatOrganisationStatus,
  formatOrganisationType,
  getOrganisationStatusPresentation,
  getOrganisationTypePresentation,
} from "@/features/organisations/presentation";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export type OrganisationDirectoryRow = Organisation & {
  membershipState: "has_members" | "no_members";
};

type OrganisationsDirectoryTableColumnsProps = {
  onView?: (org: OrganisationDirectoryRow) => void;
};

export function getOrganisationsDirectoryTableColumns({
  onView,
}: OrganisationsDirectoryTableColumnsProps = {}): ColumnDef<OrganisationDirectoryRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Organisation",
      cell: ({ row }) => {
        const org = row.original;
        return (
          <div className="min-w-[200px]">
            <span className="text-sm font-medium text-primary">{org.name}</span>
            <p className="text-xs font-mono text-muted-foreground">{org.id}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = getOrganisationTypePresentation(row.original.type);
        return (
          <Badge variant={type.badgeVariant}>
            {formatOrganisationType(row.original.type)}
          </Badge>
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
      id: "members",
      accessorKey: "membershipState",
      header: "Members",
      cell: ({ row }) => {
        const members = row.original.memberCount ?? 0;
        if (members < 1) {
          return (
            <span className="text-sm text-amber-700 dark:text-amber-400">
              No members
            </span>
          );
        }
        return (
          <span className="text-sm">
            {members}
            {typeof row.original.activeMemberCount === "number"
              ? ` (${row.original.activeMemberCount} active)`
              : ""}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const org = row.original;
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
                  onView?.(org);
                }}
              >
                Open organisation
              </DropdownMenuItem>
              {org.type === "reward_partner" ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={FULFILMENT_ROUTES.partnerDetail(org.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Partner readiness
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
