import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type ImageUploadState = {
  publicId: string | undefined;
  imageName: string | undefined;
};

const initialImageUploadState: ImageUploadState = {
  publicId: undefined,
  imageName: undefined,
};

const imageUploadSlice = createSlice({
  name: "imageUpload",
  initialState: initialImageUploadState,
  reducers: {
    setPublicId: (state, action: PayloadAction<string | undefined>) => {
      state.publicId = action.payload;
    },
    setImageName: (state, action: PayloadAction<string | undefined>) => {
      state.imageName = action.payload;
    },
  },
});

export const { setPublicId, setImageName } = imageUploadSlice.actions;
const imageUploadReducer = imageUploadSlice.reducer;
export default imageUploadReducer;
