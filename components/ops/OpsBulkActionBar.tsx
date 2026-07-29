"use client";

import { Button } from "@/components/ui/button";

type OpsBulkActionBarProps = {
  selectedCount: number;
  onClear: () => void;
  actions: Array<{
    id: string;
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive" | "secondary";
    disabled?: boolean;
  }>;
};

export function OpsBulkActionBar({
  selectedCount,
  onClear,
  actions,
}: OpsBulkActionBarProps) {
  if (selectedCount < 1) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
      role="region"
      aria-label="Bulk actions"
    >
      <p className="text-sm font-medium">
        {selectedCount} selected
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-2 h-7"
          onClick={onClear}
        >
          Clear
        </Button>
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.variant ?? "outline"}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
