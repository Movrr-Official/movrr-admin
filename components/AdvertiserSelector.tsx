"use client";

import { useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useQuery } from "@tanstack/react-query";

import { RootState } from "@/redux/store";
import { MultiSelect } from "@/components/ui/multi-select";
import { setSelectedAdvertiserIds } from "@/redux/slices/advertiserFilter";
import { getAdvertiserOptions } from "@/app/actions/advertisers";

const AdvertiserSelector = () => {
  const dispatch = useDispatch();
  const { selectedAdvertiserIds } = useSelector(
    (state: RootState) => state.advertiserFilter,
  );

  const { data: advertisersData } = useQuery({
    queryKey: ["advertiser-profile-options"],
    queryFn: async () => {
      const result = await getAdvertiserOptions();
      if (!result.success || !result.data) {
        return [];
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const advertisers = useMemo(() => advertisersData ?? [], [advertisersData]);

  const advertiserOptions = advertisers.map((advertiser) => ({
    label: advertiser.label,
    value: advertiser.userId,
  }));

  return (
    <div className="w-full">
      <MultiSelect
        label="Advertisers"
        options={advertiserOptions}
        selected={selectedAdvertiserIds}
        onChange={(values) => dispatch(setSelectedAdvertiserIds(values))}
        placeholder="Filter by advertiser(s)"
      />
    </div>
  );
};

export default AdvertiserSelector;
