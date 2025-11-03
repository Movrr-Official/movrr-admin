import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { UserRole, UserStatus } from "@/schemas";

type UsersFilterState = {
  searchValue: string;
  roleFilter: UserRole | "all";
  statusFilter: UserStatus | "all";
};

const initialUsersFilterState: UsersFilterState = {
  searchValue: "",
  roleFilter: "all",
  statusFilter: "all",
};

const usersFilterSlice = createSlice({
  name: "usersFilter",
  initialState: initialUsersFilterState,
  reducers: {
    setSearchValue: (state, action: PayloadAction<string>) => {
      state.searchValue = action.payload;
    },
    setRoleFilter: (state, action: PayloadAction<UserRole | "all">) => {
      state.roleFilter = action.payload;
    },
    setStatusFilter: (state, action: PayloadAction<UserStatus | "all">) => {
      state.statusFilter = action.payload;
    },
    resetFilters: (state) => {
      state.searchValue = "";
      state.roleFilter = "all";
      state.statusFilter = "all";
    },
  },
});

export const { setSearchValue, setRoleFilter, setStatusFilter, resetFilters } =
  usersFilterSlice.actions;

export const usersFilterReducer = usersFilterSlice.reducer;
export default usersFilterReducer;
