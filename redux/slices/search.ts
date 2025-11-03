import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type SearchState = {
  value: string;
};

const initialSearchState: SearchState = {
  value: "",
};

const searchSlice = createSlice({
  name: "search",
  initialState: initialSearchState,
  reducers: {
    setSearchValue: (state, action: PayloadAction<string>) => {
      state.value = action.payload;
    },
    clearSearchValue: (state) => {
      state.value = "";
    },
  },
});

export const { setSearchValue, clearSearchValue } = searchSlice.actions;
export const searchReducer = searchSlice.reducer;
export default searchReducer;
