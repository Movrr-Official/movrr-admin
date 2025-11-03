import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface UIState {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  modals: {
    createCampaign: boolean;
    createRoute: boolean;
    routeOptimization: boolean;
  };
  loading: {
    campaigns: boolean;
    routes: boolean;
    analytics: boolean;
  };
}

const initialState: UIState = {
  sidebarOpen: true,
  theme: "light",
  modals: {
    createCampaign: false,
    createRoute: false,
    routeOptimization: false,
  },
  loading: {
    campaigns: false,
    routes: false,
    analytics: false,
  },
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    toggleTheme: (state) => {
      state.theme = state.theme === "light" ? "dark" : "light";
    },
    openModal: (state, action: PayloadAction<keyof UIState["modals"]>) => {
      state.modals[action.payload] = true;
    },
    closeModal: (state, action: PayloadAction<keyof UIState["modals"]>) => {
      state.modals[action.payload] = false;
    },
    setLoading: (
      state,
      action: PayloadAction<{ key: keyof UIState["loading"]; value: boolean }>
    ) => {
      state.loading[action.payload.key] = action.payload.value;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  toggleTheme,
  openModal,
  closeModal,
  setLoading,
} = uiSlice.actions;
const uiReducer = uiSlice.reducer;
export default uiReducer;
