"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { InlineFilterControls } from "@/components/filters/InlineFilterControls";
import type { FilterConfig } from "@/lib/applyFilters";

type FiltersSheetProps = {
  filterConfig: FilterConfig[];
  activeFilters: Record<string, unknown>;
  activeFilterCount: number;
  updateFilter: (key: string, value: unknown) => void;
  clearAllFilters: () => void;
  className?: string;
};

export function FiltersSheet({
  filterConfig,
  activeFilters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
  className,
}: FiltersSheetProps) {
  const [open, setOpen] = useState(false);
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-9 gap-2 ${className ?? ""}`}
          aria-label={
            hasActiveFilters
              ? `Open filters, ${activeFilterCount} active`
              : "Open filters"
          }
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span>Filters</span>
          {hasActiveFilters ? (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 px-1 justify-center"
              aria-hidden
            >
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] gap-0 p-0">
        <SheetHeader className="border-b border-border px-4 py-4 text-left">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Narrow the table results. Multi-select fields stay multi-select.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 py-4">
          <InlineFilterControls
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            updateFilter={updateFilter}
            layout="stack"
          />
        </div>
        <SheetFooter className="border-t border-border px-4 py-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={!hasActiveFilters}
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
