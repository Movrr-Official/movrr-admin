import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface MaintenanceState {
  isEnabled: boolean;
  message: string;
  estimatedCompletion: string;
  lastUpdated: string;
}

const initialState: MaintenanceState = {
  isEnabled: false,
  message: "We're performing scheduled maintenance. Please check back soon.",
  estimatedCompletion: "",
  lastUpdated: new Date().toISOString(),
};

const maintenanceSlice = createSlice({
  name: "maintenance",
  initialState,
  reducers: {
    toggleMaintenance: (state, action: PayloadAction<boolean>) => {
      state.isEnabled = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    updateMessage: (state, action: PayloadAction<string>) => {
      state.message = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    updateEstimatedCompletion: (state, action: PayloadAction<string>) => {
      state.estimatedCompletion = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    setMaintenanceData: (
      state,
      action: PayloadAction<Partial<MaintenanceState>>
    ) => {
      Object.assign(state, action.payload);
      state.lastUpdated = new Date().toISOString();
    },
  },
});

export const {
  toggleMaintenance,
  updateMessage,
  updateEstimatedCompletion,
  setMaintenanceData,
} = maintenanceSlice.actions;

export const maintenanceReducer = maintenanceSlice.reducer;
export default maintenanceReducer;
