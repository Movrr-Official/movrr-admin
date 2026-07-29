"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type OpsFilterOption = {
  value: string;
  label: string;
};

export type OpsFilterField = {
  id: string;
  label: string;
  value: string;
  options: OpsFilterOption[];
  onChange: (value: string) => void;
  allValue?: string;
};

type OpsFilterToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchLabel?: string;
  filters: OpsFilterField[];
  trailing?: ReactNode;
  className?: string;
};

export function OpsFilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel = "Search",
  filters,
  trailing,
  className,
}: OpsFilterToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between",
        className,
      )}
    >
      <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
          <Label htmlFor="ops-search">{searchLabel}</Label>
          <Input
            id="ops-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        </div>
        {filters.map((filter) => {
          const allValue = filter.allValue ?? "all";
          return (
            <div key={filter.id} className="space-y-1.5">
              <Label htmlFor={`ops-filter-${filter.id}`}>{filter.label}</Label>
              <Select value={filter.value} onValueChange={filter.onChange}>
                <SelectTrigger
                  id={`ops-filter-${filter.id}`}
                  aria-label={filter.label}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filter.value !== allValue ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => filter.onChange(allValue)}
                >
                  Clear {filter.label.toLowerCase()}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {trailing ? <div className="flex shrink-0 gap-2">{trailing}</div> : null}
    </div>
  );
}
