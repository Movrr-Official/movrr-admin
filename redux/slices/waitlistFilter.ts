import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FilterState } from "@/lib/applyFilters";

type WaitlistFilterState = FilterState & {
  searchValue: string;
  statusFilter: "all" | "pending" | "approved" | "rejected";
  cityFilter: string | string[];
  dateRange: { start: string | null; end: string | null };
};

const initialWaitlistFilterState: WaitlistFilterState = {
  searchValue: "",
  statusFilter: "all",
  cityFilter: "all",
  dateRange: { start: null, end: null },
};

const waitlistFilterSlice = createSlice({
  name: "waitlistFilter",
  initialState: initialWaitlistFilterState,
  reducers: {
    setSearchValue: (state, action: PayloadAction<string>) => {
      state.searchValue = action.payload;
    },
    setStatusFilter: (
      state,
      action: PayloadAction<"all" | "pending" | "approved" | "rejected">
    ) => {
      state.statusFilter = action.payload;
    },
    setCityFilter: (state, action: PayloadAction<string | string[]>) => {
      state.cityFilter = action.payload;
    },
    setDateRange: (
      state,
      action: PayloadAction<{ start: string | null; end: string | null }>
    ) => {
      state.dateRange = action.payload;
    },
    setFilters: (
      state,
      action: PayloadAction<Partial<WaitlistFilterState>>
    ) => {
      Object.assign(state, action.payload);
    },
    resetFilters: (state) => {
      state.searchValue = "";
      state.statusFilter = "all";
      state.cityFilter = "all";
      state.dateRange = { start: null, end: null };
    },
  },
});

export const {
  setSearchValue,
  setStatusFilter,
  setCityFilter,
  setDateRange,
  setFilters,
  resetFilters,
} = waitlistFilterSlice.actions;

export const waitlistFilterReducer = waitlistFilterSlice.reducer;
export default waitlistFilterReducer;
