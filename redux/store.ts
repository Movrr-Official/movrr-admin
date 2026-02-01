import { configureStore } from "@reduxjs/toolkit";

import advertiserFilterReducer from "./slices/advertiserFilter";
import filtersSlice from "./slices/filters";
import imageUploadReducer from "./slices/imageUpload";
import searchReducer from "./slices/search";
import uiSlice from "./slices/ui";
import usersFilterReducer from "./slices/usersFilter";
import routeFilterReducer from "./slices/routeFilter";
import campaignsFilterReducer from "./slices/campaignsFilter";
import notificationReducer from "./slices/notification";
import maintenanceReducer from "./slices/maintenance";
import { waitlistFilterReducer } from "./slices/waitlistFilter";
import { NODE_ENV } from "@/lib/env";

export const store = configureStore({
  reducer: {
    advertiserFilter: advertiserFilterReducer,
    campaignsFilter: campaignsFilterReducer,
    filters: filtersSlice,
    imageUpload: imageUploadReducer,
    maintenance: maintenanceReducer,
    notifications: notificationReducer,
    search: searchReducer,
    routeFilter: routeFilterReducer,
    ui: uiSlice,
    usersFilter: usersFilterReducer,
    waitlistFilter: waitlistFilterReducer,
  },
  devTools: NODE_ENV !== "production",
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
