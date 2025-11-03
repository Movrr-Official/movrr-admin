"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { FilterConfig } from "@/lib/applyFilters";

interface ActiveFiltersDisplayProps {
  activeFilters: Record<string, any>;
  filterConfig: FilterConfig[];
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;
  variant?: "default" | "compact";
}

export function ActiveFiltersDisplay({
  activeFilters,
  filterConfig,
  clearFilter,
  clearAllFilters,
  variant = "default",
}: ActiveFiltersDisplayProps) {
  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  if (!hasActiveFilters) {
    return null;
  }

  const getDisplayValue = (filter: FilterConfig, value: any): string => {
    if (Array.isArray(value)) {
      return value
        .map((v) => filter.options?.find((o) => o.value === v)?.label || v)
        .join(", ");
    }
    return (
      filter.options?.find((o) => o.value === value)?.label || String(value)
    );
  };

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-2 sm:flex-1">
        <span className="text-sm text-muted-foreground">Filters:</span>
        {Object.entries(activeFilters).map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0))
            return null;

          const filter = filterConfig.find((f) => f.key === key);
          if (!filter) return null;

          return (
            <Badge key={key} variant="secondary" className="gap-1">
              {filter.label}: {getDisplayValue(filter, value)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => clearFilter(key)}
              />
            </Badge>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-6 px-2 text-xs"
        >
          Clear all
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <span className="text-sm font-semibold text-foreground">
        Active Filters:
      </span>
      {Object.entries(activeFilters).map(([key, value]) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return null;

        const filter = filterConfig.find((f) => f.key === key);
        if (!filter) return null;

        return (
          <Badge
            key={key}
            variant="secondary"
            className="gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border-primary/30"
          >
            <span className="text-xs font-medium">
              {filter.label}:{" "}
              <span className="font-semibold">
                {getDisplayValue(filter, value)}
              </span>
            </span>
            <button
              onClick={() => clearFilter(key)}
              className="ml-1 hover:text-destructive transition-colors"
              aria-label={`Remove ${filter.label} filter`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        onClick={clearAllFilters}
        className="text-xs h-6 hover:bg-destructive/10 hover:text-destructive"
      >
        Clear All
      </Button>
    </div>
  );
}
