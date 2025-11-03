"use client";

import React, { useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";

import { mockUsers } from "@/data/mockUsers";
import { RootState } from "@/redux/store";
import { MultiSelect } from "@/components/ui/multi-select";
import { setSelectedAdvertiserIds } from "@/redux/slices/advertiserFilter";

const AdvertiserSelector = () => {
  const dispatch = useDispatch();
  const { selectedAdvertiserIds } = useSelector(
    (state: RootState) => state.advertiserFilter
  );

  const advertisers = useMemo(
    () => mockUsers.filter((user) => user.role === "advertiser"),
    []
  );

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
