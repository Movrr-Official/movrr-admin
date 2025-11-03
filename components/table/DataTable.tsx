"use client";

import React, { useEffect, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { DataTablePagination } from "../table/DataTablePagination";
import { DataTableViewOptions } from "../table/DataTableViewOptions";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "../EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { DataTableSearch } from "./DataTableSearch";
import { useSearchParams } from "next/navigation";

interface FilterOptions {
  role?: string[];
  status?: string[];
  campaignType?: string[];
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onRowClick?: (row: TData) => void;
  searchKey?: string;
  searchFields?: string[];
  searchParamKey?: string;
  filterOptions?: FilterOptions;
  defaultSort?: { id: string; desc: boolean };
  searchBar?: boolean;
  viewOptions?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateIcon?:
    | "file"
    | "book"
    | "database"
    | "search"
    | "package"
    | "default";
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchValue,
  onSearchChange,
  onRowClick,
  searchKey,
  searchFields = ["name", "email"],
  searchParamKey = "search",
  filterOptions,
  defaultSort,
  searchBar = true,
  viewOptions = false,
  emptyStateTitle,
  emptyStateDescription,
  emptyStateIcon,
  className,
}: DataTableProps<TData, TValue>) {
  const searchParams = useSearchParams();
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort ? [{ id: defaultSort.id, desc: defaultSort.desc }] : []
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Get search value from URL params first, then fall back to props
  const urlSearchValue = searchParams.get(searchParamKey) || "";
  const [globalFilter, setGlobalFilter] = useState(urlSearchValue);

  // Sync with URL search params
  useEffect(() => {
    const searchValueFromUrl = searchParams.get(searchParamKey) || "";
    setGlobalFilter(searchValueFromUrl);
  }, [searchParams, searchParamKey]);

  // Sync with external search value if provided
  useEffect(() => {
    if (searchValue !== undefined && searchValue !== globalFilter) {
      setGlobalFilter(searchValue);
    }
  }, [searchValue, globalFilter]);

  // Notify parent component when global filter changes
  useEffect(() => {
    onSearchChange?.(globalFilter as string);
  }, [globalFilter, onSearchChange]);

  // Initialize column filters from filterOptions
  useEffect(() => {
    if (filterOptions) {
      const initialFilters = Object.entries(filterOptions)
        // only include filters that actually have values
        .filter(([, options]) => options.length > 0)
        .map(([id, options]) => ({ id, value: options }));
      setColumnFilters(initialFilters);
    }
  }, [filterOptions]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const searchTerm = filterValue.toLowerCase();

      // Search across specified fields
      return searchFields.some((field) => {
        const value = (row.getValue(field) as string)?.toLowerCase() || "";
        return value.includes(searchTerm);
      });
    },
  });

  const handleRowClick = (row: Row<TData>) => {
    if (onRowClick) {
      onRowClick(row.original);
    }
  };

  return (
    <Card
      className={`glass-card border-0 shadow-lg animate-slide-up ${className}`}
      style={{ animationDelay: "0.5s" }}
    >
      {viewOptions && (
        <div className="flex items-center p-4 pt-6 ">
          <DataTableViewOptions table={table} />
        </div>
      )}
      <CardHeader className="gap-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold">
              Waitlist Entries
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              All pre-launch signups ({data.length} total)
            </CardDescription>
          </div>
          {searchBar && (
            <DataTableSearch
              className="sm:w-[220px]"
              placeholder="Search entries..."
              paramKey={searchParamKey}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full rounded-xl border border-border/50 overflow-x-auto bg-card/30 backdrop-blur-sm">
          <Table className="w-full min-w-full">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        key={header.id}
                        className="font-bold text-sm px-6 py-3 opacity-70"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={
                      onRowClick ? "cursor-pointer hover:bg-muted/50" : ""
                    }
                    onClick={onRowClick ? () => handleRowClick(row) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-6 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    <EmptyState
                      title={emptyStateTitle || "No Data Found"}
                      description={
                        emptyStateDescription ||
                        "No records match your search criteria."
                      }
                      iconName={emptyStateIcon || "search"}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <div className="px-4">
        <DataTablePagination table={table} />
      </div>
    </Card>
  );
}
