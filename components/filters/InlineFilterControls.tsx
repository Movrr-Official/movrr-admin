"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterConfig } from "@/lib/applyFilters";

type InlineFilterControlsProps = {
  filterConfig: FilterConfig[];
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
};

function selectedValues(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw) return [raw];
  return [];
}

function InlineMultiSelectFilter({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
}) {
  const selected = selectedValues(activeFilters[filter.key]);
  const count = selected.length;
  const label =
    count === 0
      ? `All ${filter.label}`
      : count === 1
        ? (filter.options?.find((o) => o.value === selected[0])?.label ??
          filter.label)
        : `${filter.label} (${count})`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-[150px] justify-between gap-2 bg-background font-normal"
          aria-label={filter.label}
        >
          <span className="truncate">{label}</span>
          <span className="flex items-center gap-1 shrink-0">
            {count > 0 ? (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 px-1 justify-center"
              >
                {count}
              </Badge>
            ) : null}
            <ChevronDown className="h-4 w-4 opacity-60" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{filter.label}</span>
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => updateFilter(filter.key, null)}
            >
              Clear
            </Button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filter.options?.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => event.preventDefault()}
              className="flex items-center gap-2"
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => {
                  const next = isSelected
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value];
                  updateFilter(filter.key, next);
                }}
                aria-label={option.label}
              />
              <span className="flex-1">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InlineSingleSelectFilter({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
}) {
  const raw = activeFilters[filter.key];
  const current =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? String(raw[0] ?? "")
        : "";
  const value = current || "__all__";

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        updateFilter(filter.key, next === "__all__" ? null : next);
      }}
    >
      <SelectTrigger className="h-9 w-[150px] bg-background" aria-label={filter.label}>
        <SelectValue placeholder={filter.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All {filter.label}</SelectItem>
        {filter.options?.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InlineFilterControls({
  filterConfig,
  activeFilters,
  updateFilter,
}: InlineFilterControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filterConfig.map((filter) => {
        if (!filter.options?.length) return null;

        if (filter.type === "multi-select") {
          return (
            <InlineMultiSelectFilter
              key={filter.id}
              filter={filter}
              activeFilters={activeFilters}
              updateFilter={updateFilter}
            />
          );
        }

        return (
          <InlineSingleSelectFilter
            key={filter.id}
            filter={filter}
            activeFilters={activeFilters}
            updateFilter={updateFilter}
          />
        );
      })}
    </div>
  );
}
