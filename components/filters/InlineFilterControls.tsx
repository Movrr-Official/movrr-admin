"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import type { FilterConfig } from "@/lib/applyFilters";

type InlineFilterControlsProps = {
  filterConfig: FilterConfig[];
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
  /** inline = toolbar chips; stack = full-width sheet/mobile form */
  layout?: "inline" | "stack";
  /** compact shrinks control width on md–lg toolbars */
  density?: "default" | "compact";
  className?: string;
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
  fullWidth,
  density,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
  fullWidth?: boolean;
  density?: "default" | "compact";
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
  const ariaLabel =
    count === 0
      ? `${filter.label}, all selected`
      : `${filter.label}, ${count} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 justify-between gap-2 bg-background font-normal",
            fullWidth
              ? "w-full"
              : density === "compact"
                ? "min-w-[7.5rem] max-w-[11rem] lg:min-w-[9rem] lg:max-w-[13rem]"
                : "min-w-[150px]",
          )}
          aria-label={ariaLabel}
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
      <DropdownMenuContent
        align="start"
        className="w-56 max-h-80 overflow-y-auto"
      >
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
  fullWidth,
  density,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
  fullWidth?: boolean;
  density?: "default" | "compact";
}) {
  const raw = activeFilters[filter.key];
  const current =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? String(raw[0] ?? "")
        : "";
  const value = current || "__all__";
  const selectedLabel =
    value === "__all__"
      ? `All ${filter.label}`
      : (filter.options?.find((option) => option.value === value)?.label ??
        filter.label);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        updateFilter(filter.key, next === "__all__" ? null : next);
      }}
    >
      <SelectTrigger
        className={cn(
          "h-9 bg-background",
          fullWidth
            ? "w-full"
            : density === "compact"
              ? "w-[7.5rem] lg:w-[9.5rem]"
              : "w-[150px]",
        )}
        aria-label={`${filter.label}: ${selectedLabel}`}
      >
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

function InlineCheckboxFilter({
  filter,
  activeFilters,
  updateFilter,
  fullWidth,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, unknown>;
  updateFilter: (key: string, value: unknown) => void;
  fullWidth?: boolean;
}) {
  const checked = Boolean(activeFilters[filter.key]);

  return (
    <Button
      type="button"
      variant={checked ? "default" : "outline"}
      size="sm"
      className={cn(
        "h-9 gap-2 bg-background font-normal",
        fullWidth && "w-full justify-start",
      )}
      aria-pressed={checked}
      aria-label={filter.label}
      onClick={() => updateFilter(filter.key, checked ? null : true)}
    >
      <Checkbox checked={checked} aria-hidden />
      {filter.label}
    </Button>
  );
}

function FilterFieldShell({
  label,
  layout,
  children,
}: {
  label: string;
  layout: "inline" | "stack";
  children: React.ReactNode;
}) {
  if (layout === "stack") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {children}
      </div>
    );
  }
  return <>{children}</>;
}

export function InlineFilterControls({
  filterConfig,
  activeFilters,
  updateFilter,
  layout = "inline",
  density = "default",
  className,
}: InlineFilterControlsProps) {
  const fullWidth = layout === "stack";

  return (
    <div
      className={cn(
        layout === "stack"
          ? "flex flex-col gap-4"
          : "flex flex-wrap items-center gap-1.5 lg:gap-2",
        className,
      )}
    >
      {filterConfig.map((filter) => {
        if (filter.type === "checkbox") {
          return (
            <FilterFieldShell
              key={filter.id}
              label={filter.label}
              layout={layout}
            >
              <InlineCheckboxFilter
                filter={filter}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                fullWidth={fullWidth}
              />
            </FilterFieldShell>
          );
        }

        if (!filter.options?.length) return null;

        if (filter.type === "multi-select") {
          return (
            <FilterFieldShell
              key={filter.id}
              label={filter.label}
              layout={layout}
            >
              <InlineMultiSelectFilter
                filter={filter}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                fullWidth={fullWidth}
                density={density}
              />
            </FilterFieldShell>
          );
        }

        if (filter.type === "select") {
          return (
            <FilterFieldShell
              key={filter.id}
              label={filter.label}
              layout={layout}
            >
              <InlineSingleSelectFilter
                filter={filter}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                fullWidth={fullWidth}
                density={density}
              />
            </FilterFieldShell>
          );
        }

        return null;
      })}
    </div>
  );
}
