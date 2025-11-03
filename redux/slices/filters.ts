import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface FiltersState {
  dateRange: {
    from: string | null;
    to: string | null;
  };
  campaignStatus: string[];
  routeStatus: string[];
  searchQuery: string;
}

const initialState: FiltersState = {
  dateRange: {
    from: null,
    to: null,
  },
  campaignStatus: [],
  routeStatus: [],
  searchQuery: "",
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setDateRange: (
      state,
      action: PayloadAction<{ from: string | null; to: string | null }>
    ) => {
      state.dateRange = action.payload;
    },
    setCampaignStatus: (state, action: PayloadAction<string[]>) => {
      state.campaignStatus = action.payload;
    },
    setRouteStatus: (state, action: PayloadAction<string[]>) => {
      state.routeStatus = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    resetFilters: () => {
      return initialState;
    },
  },
});

export const {
  setDateRange,
  setCampaignStatus,
  setRouteStatus,
  setSearchQuery,
  resetFilters,
} = filtersSlice.actions;
const filtersReducer = filtersSlice.reducer;
export default filtersReducer;
