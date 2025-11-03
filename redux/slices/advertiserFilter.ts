import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AdvertiserFilterState {
  selectedAdvertiserIds: string[];
}

const initialState: AdvertiserFilterState = {
  selectedAdvertiserIds: [],
};

export const advertiserFilterSlice = createSlice({
  name: "advertiserFilter",
  initialState,
  reducers: {
    setSelectedAdvertiserIds(state, action: PayloadAction<string[]>) {
      state.selectedAdvertiserIds = action.payload;
    },
    clearSelectedAdvertisers(state) {
      state.selectedAdvertiserIds = [];
    },
  },
});

export const { setSelectedAdvertiserIds, clearSelectedAdvertisers } =
  advertiserFilterSlice.actions;
const advertiserFilterReducer = advertiserFilterSlice.reducer;
export default advertiserFilterReducer;
