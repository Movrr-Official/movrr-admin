"use client";

import React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTableViewOptions } from "../table/DataTableViewOptions";
import { DataTableSearch } from "../table/DataTableSearch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableSkeletonProps {
  /** Number of rows to show in skeleton */
  rowCount?: number;
  /** Number of columns to show in skeleton */
  columnCount?: number;
  /** Whether to show search bar */
  searchBar?: boolean;
  /** Whether to show view options */
  viewOptions?: boolean;
  /** Title to show in skeleton */
  title?: string;
  /** Description to show in skeleton */
  description?: string;
  /** Custom className */
  className?: string;
  /** Show pagination skeleton */
  showPagination?: boolean;
}

export function DataTableSkeleton({
  rowCount = 10,
  columnCount = 6,
  searchBar = true,
  viewOptions = false,
  className = "",
  showPagination = true,
}: DataTableSkeletonProps) {
  // Arrays for rows and columns
  const rows = Array.from({ length: rowCount }, (_, i) => i);
  const columns = Array.from({ length: columnCount }, (_, i) => i);

  return (
    <Card
      className={`glass-card border-0 shadow-lg animate-pulse ${className}`}
    >
      {viewOptions && (
        <div className="flex items-center p-4 pt-6">
          <div className="opacity-50">
            <DataTableViewOptions table={{} as any} />
          </div>
        </div>
      )}

      <CardHeader className="gap-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>
              <Skeleton className="h-6 w-48 bg-muted-foreground/20" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-32 bg-muted-foreground/20" />
            </CardDescription>
          </div>
          {searchBar && (
            <div className="opacity-50">
              <DataTableSearch
                className="sm:w-[220px]"
                placeholder="Search..."
                value=""
                onSearchChange={() => {}}
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="w-full rounded-xl border border-border/50 overflow-x-auto bg-card/30 backdrop-blur-sm">
          <Table className="w-full min-w-full">
            <TableHeader>
              <TableRow>
                {columns.map((columnIndex) => (
                  <TableHead key={columnIndex} className="px-6 py-3">
                    <Skeleton className="h-4 w-24 bg-muted-foreground/20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((columnIndex) => (
                    <TableCell key={columnIndex} className="px-6 py-3">
                      <Skeleton
                        className={`h-4 bg-muted-foreground/20 ${
                          // Varied width for more realistic skeleton
                          columnIndex % 3 === 0
                            ? "w-32"
                            : columnIndex % 3 === 1
                              ? "w-24"
                              : "w-16"
                        }`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {showPagination && (
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-20 bg-muted-foreground/20" />
              <Skeleton className="h-4 w-32 bg-muted-foreground/20" />
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-8 bg-muted-foreground/20" />
              <Skeleton className="h-8 w-8 bg-muted-foreground/20" />
              <Skeleton className="h-8 w-8 bg-muted-foreground/20" />
              <Skeleton className="h-8 w-8 bg-muted-foreground/20" />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
