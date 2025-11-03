"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { FilterConfig, FilterState } from "@/lib/applyFilters";

interface UseFiltersProps {
  data: any[];
  filterConfig: FilterConfig[];
  persistToUrl?: boolean;
  debounceMs?: number;
  onFilteredDataChange?: (filteredData: any[]) => void;
}

export function useFilters({
  data,
  filterConfig,
  persistToUrl = true,
  debounceMs = 300,
  onFilteredDataChange,
}: UseFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize filters from URL
  useEffect(() => {
    if (!persistToUrl || isInitialized) return;

    const urlFilters: FilterState = {};
    filterConfig.forEach((config) => {
      const value = searchParams.get(config.key);
      if (value) {
        if (config.type === "multi-select") {
          urlFilters[config.key] = value.split(",");
        } else if (config.type === "checkbox") {
          urlFilters[config.key] = value === "true";
        } else {
          urlFilters[config.key] = value;
        }
      }
    });

    setFilters(urlFilters);
    setIsInitialized(true);
  }, [searchParams, filterConfig, persistToUrl, isInitialized]);

  // Update URL when filters change
  const updateUrl = useCallback(
    (newFilters: FilterState) => {
      if (!persistToUrl) return;

      const params = new URLSearchParams(searchParams.toString());

      // Clear existing filter params
      filterConfig.forEach((config) => {
        params.delete(config.key);
      });

      // Add new filter params
      Object.entries(newFilters).forEach(([key, value]: [string, any]) => {
        if (value !== null && value !== undefined && value !== "") {
          if (Array.isArray(value)) {
            if (value.length > 0) {
              params.set(key, value.join(","));
            }
          } else if (typeof value === "boolean") {
            params.set(key, value.toString());
          } else {
            params.set(key, value.toString());
          }
        }
      });

      const newUrl = `${pathname}?${params.toString()}`;
      router.push(newUrl, { scroll: false });
    },
    [pathname, router, searchParams, filterConfig, persistToUrl]
  );

  // Debounced filter update
  const debouncedUpdate = useMemo(() => {
    let timeoutId: NodeJS.Timeout;

    return (newFilters: FilterState) => {
      setIsLoading(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        updateUrl(newFilters);
        setIsLoading(false);
      }, debounceMs);
    };
  }, [debounceMs, updateUrl]);

  const updateFilter = useCallback(
    (key: string, value: any) => {
      const newFilters = { ...filters };

      if (
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      ) {
        delete newFilters[key];
      } else {
        newFilters[key] = value;
      }

      setFilters(newFilters);
      debouncedUpdate(newFilters);
    },
    [filters, debouncedUpdate]
  );

  const clearFilter = useCallback(
    (key: string) => {
      updateFilter(key, null);
    },
    [updateFilter]
  );

  const clearAllFilters = useCallback(() => {
    setFilters({});
    if (persistToUrl) {
      const params = new URLSearchParams();
      // Preserve non-filter search params
      searchParams.forEach((value, key) => {
        if (!filterConfig.some((config) => config.key === key)) {
          params.set(key, value);
        }
      });
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [persistToUrl, searchParams, pathname, router, filterConfig]);

  // Apply filters to data
  const filteredData = useMemo(() => {
    if (Object.keys(filters).length === 0) return data;

    return data.filter((item) => {
      return Object.entries(filters).every(([key, filterValue]) => {
        const itemValue = item[key];

        if (filterValue === null || filterValue === undefined) return true;

        // Search filter - enhanced to search across multiple fields
        if (key === "search" && typeof filterValue === "string") {
          const searchTerm = filterValue.toLowerCase();
          return Object.entries(item).some(([fieldKey, value]) => {
            // You could make this configurable per use case
            const stringValue = String(value).toLowerCase();
            return stringValue.includes(searchTerm);
          });
        }

        // Multi-select filter
        if (Array.isArray(filterValue)) {
          return filterValue.includes(itemValue);
        }

        // Single select filter
        if (typeof filterValue === "string") {
          return itemValue === filterValue;
        }

        // Checkbox filter
        if (typeof filterValue === "boolean") {
          return itemValue === filterValue;
        }

        return true;
      });
    });
  }, [data, filters]);

  // Notify parent of filtered data changes
  useEffect(() => {
    onFilteredDataChange?.(filteredData);
  }, [filteredData, onFilteredDataChange]);

  // Get active filters count
  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0)
    ).length;
  }, [filters]);

  return {
    // State
    data,
    filteredData,
    filters,
    isLoading,
    activeFilterCount,

    // Actions
    updateFilter,
    clearFilter,
    clearAllFilters,

    // Configuration
    filterConfig,
  };
}
