"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { FilterConfig, FilterState } from "@/lib/applyFilters";

interface UseFiltersProps {
  data: any[];
  filterConfig: FilterConfig[];
  persistToUrl?: boolean;
  debounceMs?: number;
  onFilteredDataChange?: (filteredData: any[]) => void;
}

const MULTI_SELECT_URL_DEBOUNCE_MS = 500;

function buildUrl(
  pathname: string,
  params: URLSearchParams,
): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function readFiltersFromSearchParams(
  searchParams: URLSearchParams,
  filterConfig: FilterConfig[],
): FilterState {
  const urlFilters: FilterState = {};
  filterConfig.forEach((config) => {
    const value = searchParams.get(config.key);
    if (!value) return;
    if (config.type === "multi-select") {
      urlFilters[config.key] = value.split(",").filter(Boolean);
    } else if (config.type === "checkbox") {
      urlFilters[config.key] = value === "true";
    } else {
      urlFilters[config.key] = value;
    }
  });
  return urlFilters;
}

function filtersEqual(a: FilterState, b: FilterState): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const av = a[key];
    const bv = b[key];
    if (Array.isArray(av) && Array.isArray(bv)) {
      return (
        av.length === bv.length && av.every((value, index) => value === bv[index])
      );
    }
    return av === bv;
  });
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

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const filterKeys = useMemo(
    () => new Set(filterConfig.map((config) => config.key)),
    [filterConfig],
  );

  const filterConfigByKey = useMemo(() => {
    const map = new Map<string, FilterConfig>();
    filterConfig.forEach((config) => map.set(config.key, config));
    return map;
  }, [filterConfig]);

  // Initialize / resync filters from URL (preserves back/forward + deep links).
  // Skip while a local URL write is pending so search/other params don't wipe filters.
  useEffect(() => {
    if (!persistToUrl) {
      if (!isInitialized) setIsInitialized(true);
      return;
    }
    if (timeoutRef.current) return;

    const urlFilters = readFiltersFromSearchParams(searchParams, filterConfig);
    setFilters((prev) => (filtersEqual(prev, urlFilters) ? prev : urlFilters));
    if (!isInitialized) setIsInitialized(true);
  }, [searchParams, filterConfig, persistToUrl, isInitialized]);

  const updateUrl = useCallback(
    (newFilters: FilterState) => {
      if (!persistToUrl) return;

      // Start from current params so non-filter keys (id, search, etc.) stay intact
      const params = new URLSearchParams(searchParamsRef.current.toString());

      filterConfig.forEach((config) => {
        params.delete(config.key);
      });

      Object.entries(newFilters).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value)) {
          if (value.length > 0) params.set(key, value.join(","));
          return;
        }
        if (typeof value === "boolean") {
          params.set(key, value.toString());
          return;
        }
        if (typeof value === "object") return;
        params.set(key, String(value));
      });

      router.push(buildUrl(pathname, params), { scroll: false });
    },
    [pathname, router, filterConfig, persistToUrl],
  );

  const scheduleUrlUpdate = useCallback(
    (newFilters: FilterState, key?: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsLoading(true);

      const config = key ? filterConfigByKey.get(key) : undefined;
      const delay =
        config?.type === "multi-select"
          ? Math.max(debounceMs, MULTI_SELECT_URL_DEBOUNCE_MS)
          : debounceMs;

      timeoutRef.current = setTimeout(() => {
        updateUrl(newFilters);
        setIsLoading(false);
        timeoutRef.current = null;
      }, delay);
    },
    [debounceMs, filterConfigByKey, updateUrl],
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const updateFilter = useCallback(
    (key: string, value: any) => {
      const newFilters = { ...filtersRef.current };

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
      scheduleUrlUpdate(newFilters, key);
    },
    [scheduleUrlUpdate],
  );

  const clearFilter = useCallback(
    (key: string) => {
      updateFilter(key, null);
    },
    [updateFilter],
  );

  const clearAllFilters = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setFilters({});
    setIsLoading(false);
    if (!persistToUrl) return;

    const params = new URLSearchParams();
    searchParamsRef.current.forEach((value, key) => {
      if (!filterKeys.has(key)) {
        params.set(key, value);
      }
    });
    router.push(buildUrl(pathname, params), { scroll: false });
  }, [persistToUrl, pathname, router, filterKeys]);

  const filteredData = useMemo(() => {
    if (Object.keys(filters).length === 0) return data;

    return data.filter((item) => {
      return Object.entries(filters).every(([key, filterValue]) => {
        const itemValue = item[key];

        if (filterValue === null || filterValue === undefined) return true;

        if (key === "search" && typeof filterValue === "string") {
          const searchTerm = filterValue.toLowerCase();
          return Object.values(item).some((value) =>
            String(value).toLowerCase().includes(searchTerm),
          );
        }

        if (Array.isArray(filterValue)) {
          const normalized = String(itemValue);
          return filterValue.some((value) => String(value) === normalized);
        }

        if (typeof filterValue === "string") {
          return String(itemValue) === filterValue;
        }

        if (typeof filterValue === "boolean") {
          return itemValue === filterValue;
        }

        return true;
      });
    });
  }, [data, filters]);

  useEffect(() => {
    onFilteredDataChange?.(filteredData);
  }, [filteredData, onFilteredDataChange]);

  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ).length;
  }, [filters]);

  return {
    data,
    filteredData,
    filters,
    isLoading,
    activeFilterCount,
    updateFilter,
    clearFilter,
    clearAllFilters,
    filterConfig,
  };
}
