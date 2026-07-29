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

type OrganisationListTableProps = {
  rows: Organisation[];
  isLoading: boolean;
  detailHref?: (org: Organisation) => string;
};

export function OrganisationListTable({
  rows,
  isLoading,
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
          const href = detailHref?.(row);
          return (
            <TableRow key={row.id}>
              <TableCell>
                {href ? (
                  <Link
                    href={href}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{row.name}</span>
                )}
                <p className="text-xs font-mono text-muted-foreground">
                  {row.id}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{row.type}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{row.status}</Badge>
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
