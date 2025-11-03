// Type definitions for comprehensive filtering
export interface FilterConfig {
  id: string;
  label: string;
  type: "search" | "date-range" | "select" | "multi-select" | "checkbox";
  key: string;
  options?: Array<{
    value: string;
    label: string;
    count?: number;
  }>;
  placeholder?: string;
}

export type FilterState = {
  [key: string]:
    | string
    | string[]
    | boolean
    | { start: Date | null; end: Date | null }
    | null;
};

export interface FilteredResult<T> {
  data: T[];
  totalCount: number;
  filteredCount: number;
}

// Utility function to apply filters to data
export const applyFilters = <T extends Record<string, any>>(
  data: T[],
  filters: FilterState,
  config: FilterConfig[]
): T[] => {
  return data.filter((item) => {
    return config.every((filterConfig) => {
      const filterValue = filters[filterConfig.key];

      // Handle search filter
      if (filterConfig.type === "search" && filterValue) {
        const searchTerm = (filterValue as string).toLowerCase();
        return Object.values(item).some(
          (val) => val && String(val).toLowerCase().includes(searchTerm)
        );
      }

      // Handle date range filter
      if (filterConfig.type === "date-range" && filterValue) {
        const dateRange = filterValue as {
          start: Date | null;
          end: Date | null;
        };
        const itemDate = new Date(item[filterConfig.key]);
        if (dateRange.start && itemDate < dateRange.start) return false;
        if (dateRange.end && itemDate > dateRange.end) return false;
        return true;
      }

      // Handle select filter
      if (filterConfig.type === "select" && filterValue) {
        return item[filterConfig.key] === filterValue;
      }

      // Handle multi-select filter
      if (filterConfig.type === "multi-select" && filterValue) {
        const values = Array.isArray(filterValue) ? filterValue : [filterValue];
        return values.includes(item[filterConfig.key]);
      }

      // Handle checkbox filter
      if (filterConfig.type === "checkbox" && filterValue) {
        return (
          item[filterConfig.key] === true ||
          item[filterConfig.key] === filterValue
        );
      }

      return true;
    });
  });
};

// Get active filters count
export const getActiveFiltersCount = (filters: FilterState): number => {
  return Object.values(filters).filter((value) => {
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && "start" in value && "end" in value) {
      return value.start !== null || value.end !== null;
    }
    return true;
  }).length;
};

// Clear specific filter
export const clearFilter = (filters: FilterState, key: string): FilterState => {
  const updated = { ...filters };
  delete updated[key];
  return updated;
};

// Clear all filters
export const clearAllFilters = (filters: FilterState): FilterState => {
  return {};
};

// Serialize filters to URL query params
export const serializeFilters = (filters: FilterState): URLSearchParams => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, String(v)));
    } else if (
      typeof value === "object" &&
      "start" in value &&
      "end" in value
    ) {
      if (value.start) params.append(`${key}_start`, value.start.toISOString());
      if (value.end) params.append(`${key}_end`, value.end.toISOString());
    } else {
      params.set(key, String(value));
    }
  });
  return params;
};

// Deserialize URL query params to filters
export const deserializeFilters = (params: URLSearchParams): FilterState => {
  const filters: FilterState = {};
  params.forEach((value, key) => {
    if (key.endsWith("_start") || key.endsWith("_end")) {
      const baseKey = key.replace(/_start$|_end$/, "");
      if (!filters[baseKey]) {
        filters[baseKey] = { start: null, end: null };
      }
      const dateObj = filters[baseKey] as {
        start: Date | null;
        end: Date | null;
      };
      if (key.endsWith("_start")) {
        dateObj.start = new Date(value);
      } else {
        dateObj.end = new Date(value);
      }
    } else if (filters[key]) {
      const existing = filters[key];
      filters[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing as string, value];
    } else {
      filters[key] = value;
    }
  });
  return filters;
};
