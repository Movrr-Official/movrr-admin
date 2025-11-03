import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface RouteFilterState {
  selectedRouteIds: string[];
  statusFilter: "all" | "assigned" | "in-progress" | "completed" | "cancelled";
  difficultyFilter: "all" | "easy" | "medium" | "hard";
}

const initialState: RouteFilterState = {
  selectedRouteIds: [],
  statusFilter: "all",
  difficultyFilter: "all",
};

export const routeFilterSlice = createSlice({
  name: "routeFilter",
  initialState,
  reducers: {
    setSelectedRouteIds(state, action: PayloadAction<string[]>) {
      state.selectedRouteIds = action.payload;
    },
    clearSelectedRoutes(state) {
      state.selectedRouteIds = [];
    },
    setStatusFilter(
      state,
      action: PayloadAction<
        "all" | "assigned" | "in-progress" | "completed" | "cancelled"
      >
    ) {
      state.statusFilter = action.payload;
    },
    setDifficultyFilter(
      state,
      action: PayloadAction<"all" | "easy" | "medium" | "hard">
    ) {
      state.difficultyFilter = action.payload;
    },
    resetAllFilters(state) {
      state.selectedRouteIds = [];
      state.statusFilter = "all";
      state.difficultyFilter = "all";
    },
  },
});

export const {
  setSelectedRouteIds,
  clearSelectedRoutes,
  setStatusFilter,
  setDifficultyFilter,
  resetAllFilters,
} = routeFilterSlice.actions;

const routeFilterReducer = routeFilterSlice.reducer;

export default routeFilterReducer;
