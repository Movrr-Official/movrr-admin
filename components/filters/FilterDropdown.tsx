"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { Checkbox } from "@/components/ui/checkbox";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { FilterConfig } from "@/lib/applyFilters";

interface FilterDropdownProps {
  filterConfig: FilterConfig[];
  activeFilters: Record<string, any>;
  activeFilterCount: number;
  updateFilter: (key: string, value: any) => void;
  clearAllFilters: () => void;
  hasActiveFilters: boolean;
}

export function FilterDropdown({
  filterConfig,
  activeFilters,
  activeFilterCount,
  updateFilter,
  clearAllFilters,
  hasActiveFilters,
}: FilterDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 group">
          <SlidersHorizontal className="h-4 w-4 group-hover:scale-110 transition-transform" />
          Filter
          {hasActiveFilters && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center"
            >
              {activeFilterCount}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-h-96 overflow-y-auto"
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Filters</span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-auto p-0 text-xs"
            >
              Clear all
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {filterConfig.map((filter) => (
          <FilterDropdownGroup
            key={filter.id}
            filter={filter}
            activeFilters={activeFilters}
            updateFilter={updateFilter}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Sub-component for individual filter groups
function FilterDropdownGroup({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, any>;
  updateFilter: (key: string, value: any) => void;
}) {
  return (
    <DropdownMenuGroup key={filter.id}>
      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
        {filter.label}
      </DropdownMenuLabel>

      {filter.type === "multi-select" && filter.options ? (
        <MultiSelectFilter
          filter={filter}
          activeFilters={activeFilters}
          updateFilter={updateFilter}
        />
      ) : filter.type === "select" && filter.options ? (
        <SelectFilter
          filter={filter}
          activeFilters={activeFilters}
          updateFilter={updateFilter}
        />
      ) : filter.type === "checkbox" ? (
        <CheckboxFilter
          filter={filter}
          activeFilters={activeFilters}
          updateFilter={updateFilter}
        />
      ) : null}

      <DropdownMenuSeparator />
    </DropdownMenuGroup>
  );
}

// Multi-select filter component
function MultiSelectFilter({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, any>;
  updateFilter: (key: string, value: any) => void;
}) {
  return (
    <>
      {filter.options!.map((option) => {
        const isSelected = Array.isArray(activeFilters[filter.key])
          ? (activeFilters[filter.key] as string[]).includes(option.value)
          : false;

        return (
          <DropdownMenuItem
            key={option.value}
            onSelect={(e) => e.preventDefault()}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => {
                  const currentValues = Array.isArray(activeFilters[filter.key])
                    ? (activeFilters[filter.key] as string[])
                    : [];

                  const newValues = isSelected
                    ? currentValues.filter((v) => v !== option.value)
                    : [...currentValues, option.value];

                  updateFilter(filter.key, newValues);
                }}
              />
              <span className="flex-1">{option.label}</span>
            </div>
            {option?.count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {option.count}
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

// Select filter component
function SelectFilter({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, any>;
  updateFilter: (key: string, value: any) => void;
}) {
  return (
    <div className="px-2 py-1">
      <Select
        value={(activeFilters[filter.key] as string) || ""}
        onValueChange={(value) => updateFilter(filter.key, value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={`Select ${filter.label}`} />
        </SelectTrigger>
        <SelectContent>
          {filter.options!.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center justify-between w-full">
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {option.count}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Checkbox filter component
function CheckboxFilter({
  filter,
  activeFilters,
  updateFilter,
}: {
  filter: FilterConfig;
  activeFilters: Record<string, any>;
  updateFilter: (key: string, value: any) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => e.preventDefault()}
      className="flex items-center gap-2"
    >
      <Checkbox
        checked={Boolean(activeFilters[filter.key])}
        onCheckedChange={(checked) => updateFilter(filter.key, checked)}
      />
      <span>{filter.label}</span>
    </DropdownMenuItem>
  );
}
