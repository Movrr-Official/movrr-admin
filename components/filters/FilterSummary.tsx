"use client";

interface FilterSummaryProps {
  entityName?: string;
  filteredDataLength: number;
  totalDataLength: number;
  activeFilterCount: number;
  isLoading?: boolean;
}

export function FilterSummary({
  entityName,
  filteredDataLength,
  totalDataLength,
  activeFilterCount,
  isLoading = false,
}: FilterSummaryProps) {
  if (activeFilterCount === 0) {
    return null;
  }

  return (
    <div className="p-3 bg-muted/50 border border-border rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          Showing {filteredDataLength} of {totalDataLength} {entityName} results
          {isLoading && (
            <span className="ml-2 animate-pulse">• Filtering...</span>
          )}
        </span>
        <span className="text-sm text-muted-foreground">
          {activeFilterCount} active filter
          {activeFilterCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
