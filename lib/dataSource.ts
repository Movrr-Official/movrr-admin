import {
  isProduction,
  NEXT_PUBLIC_USE_MOCK_DATA,
  USE_MOCK_DATA,
} from "@/lib/env";

export const shouldUseMockData = () => {
  if (isProduction) {
    return false;
  }

  return NEXT_PUBLIC_USE_MOCK_DATA || USE_MOCK_DATA;
};
