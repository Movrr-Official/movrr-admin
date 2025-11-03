import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type NotificationType = "success" | "error" | "info";

export type Notification = {
  id: string; // Unique ID to help with dismissal
  message: string;
  type: NotificationType;
};

type NotificationState = {
  list: Notification[];
};

const initialState: NotificationState = {
  list: [],
};

const notificationSlice = createSlice({
  name: "notification",
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.list.push(action.payload);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.list = state.list.filter((n) => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.list = [];
    },
  },
});

export const { addNotification, removeNotification, clearNotifications } =
  notificationSlice.actions;

export const notificationReducer = notificationSlice.reducer;
export default notificationReducer;
