"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StatusFilter {
  value: string;
  label: string;
  count: number;
}

interface DataTableStatusFiltersProps<TData> {
  data: TData[];
  statusKey: string;
  statusOptions: Array<{ value: string; label: string }>;
  selectedStatus: string | null;
  onStatusChange: (status: string | null) => void;
  className?: string;
}

export function DataTableStatusFilters<TData extends Record<string, any> = Record<string, any>>({
  data,
  statusKey,
  statusOptions,
  selectedStatus,
  onStatusChange,
  className,
}: DataTableStatusFiltersProps<TData>) {
  // Calculate counts for each status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const total = data.length;

    statusOptions.forEach((option) => {
      if (option.value === "all") {
        counts["all"] = total;
      } else {
        counts[option.value] = data.filter(
          (item) => item[statusKey] === option.value
        ).length;
      }
    });

    return counts;
  }, [data, statusKey, statusOptions]);

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {statusOptions.map((option) => {
        const count = statusCounts[option.value] ?? 0;
        const isActive = selectedStatus === option.value || (option.value === "all" && selectedStatus === null);

        return (
          <Button
            key={option.value}
            variant={isActive ? "default" : "ghost"}
            size="sm"
            onClick={() => onStatusChange(option.value === "all" ? null : option.value)}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium transition-colors flex items-center gap-2",
              isActive
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 hover:dark:bg-gray-700"
            )}
          >
            <span>{option.label}</span>
            <span
              className={cn(
                "flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium",
                isActive
                  ? "bg-primary-foreground text-primary"
                  : "bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-800"
              )}
            >
              {count.toLocaleString()}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
