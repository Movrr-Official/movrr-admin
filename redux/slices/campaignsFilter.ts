import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { CampaignStatus, CampaignType } from "@/schemas";

type CampaignsFilterState = {
  searchValue: string;
  status: CampaignStatus | "all";
  campaignType: CampaignType | "all";
  targetAudience: string | null;
  targetZones: string[];
};

const initialCampaignsFilterState: CampaignsFilterState = {
  searchValue: "",
  status: "all",
  campaignType: "all",
  targetAudience: null,
  targetZones: [],
};

const campaignsFilterSlice = createSlice({
  name: "campaignsFilter",
  initialState: initialCampaignsFilterState,
  reducers: {
    setSearchValue: (state, action: PayloadAction<string>) => {
      state.searchValue = action.payload;
    },
    setStatus: (state, action: PayloadAction<CampaignStatus | "all">) => {
      state.status = action.payload;
    },
    setCampaignType: (state, action: PayloadAction<CampaignType | "all">) => {
      state.campaignType = action.payload;
    },
    setTargetAudience: (state, action: PayloadAction<string | null>) => {
      state.targetAudience = action.payload;
    },
    setTargetZones: (state, action: PayloadAction<string[]>) => {
      state.targetZones = action.payload;
    },
    resetFilters: (state) => {
      state.searchValue = "";
      state.status = "all";
      state.campaignType = "all";
      state.targetAudience = null;
      state.targetZones = [];
    },
  },
});

export const {
  setSearchValue,
  setStatus,
  setCampaignType,
  setTargetAudience,
  setTargetZones,
  resetFilters,
} = campaignsFilterSlice.actions;

export const campaignsFilterReducer = campaignsFilterSlice.reducer;
export default campaignsFilterReducer;
