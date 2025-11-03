"use client";

import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { RootState } from "@/redux/store";
import { getWaitlistData } from "@/app/actions/waitlist";
import { WaitlistEntry } from "@/types/types";

export const useWaitlistData = () => {
  const { searchValue } = useSelector(
    (state: RootState) => state.waitlistFilter
  );

  const query = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist", searchValue],
    queryFn: async () => {
      return await getWaitlistData(searchValue);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ...query,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
};
