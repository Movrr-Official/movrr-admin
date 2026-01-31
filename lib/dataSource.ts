export const shouldUseMockData = () => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" ||
    process.env.USE_MOCK_DATA === "true"
  );
};
