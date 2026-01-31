"use client";

import React, { useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useQuery } from "@tanstack/react-query";

import { mockUsers } from "@/data/mockUsers";
import { RootState } from "@/redux/store";
import { MultiSelect } from "@/components/ui/multi-select";
import { setSelectedAdvertiserIds } from "@/redux/slices/advertiserFilter";
import { getUsers } from "@/app/actions/users";
import { shouldUseMockData } from "@/lib/dataSource";

const AdvertiserSelector = () => {
  const dispatch = useDispatch();
  const { selectedAdvertiserIds } = useSelector(
    (state: RootState) => state.advertiserFilter,
  );

  const { data: advertisersData } = useQuery({
    queryKey: ["advertiser-options"],
    queryFn: async () => {
      if (shouldUseMockData()) {
        return mockUsers.filter((user) => user.role === "advertiser");
      }

      const result = await getUsers({ role: "advertiser" });
      if (!result.success || !result.data) {
        return [];
      }
      return result.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const advertisers = useMemo(() => advertisersData ?? [], [advertisersData]);

  const advertiserOptions = advertisers.map((adv) => ({
    label: adv.name,
    value: adv.id,
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
