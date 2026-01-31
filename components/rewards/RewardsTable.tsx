"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { RewardTransaction } from "@/schemas";
import RewardsTableContent from "./RewardsTableContent";
import { useUsersData } from "@/hooks/useUsersData";
import { useCampaignsData } from "@/hooks/useCampaignsData";

interface RewardsTableProps {
  transactions: RewardTransaction[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function RewardsTable({
  transactions,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: RewardsTableProps) {
  // Fetch users and campaigns for filter options
  const { data: users } = useUsersData();
  const { data: campaigns } = useCampaignsData();

  // Get unique rider IDs from transactions
  const transactionRiderIds = new Set(transactions.map((txn) => txn.riderId));
  const riderOptions = users
    ?.filter((user) => transactionRiderIds.has(user.id) && user.role === "rider")
    .map((user) => ({
      value: user.id,
      label: user.name,
    })) || [];

  // Get unique campaign IDs from transactions
  const transactionCampaignIds = new Set(
    transactions.map((txn) => txn.campaignId).filter(Boolean) as string[]
  );
  const campaignOptions = campaigns
    ?.filter((campaign) => transactionCampaignIds.has(campaign.id))
    .map((campaign) => ({
      value: campaign.id,
      label: campaign.name,
    })) || [];

  const filterConfig: FilterConfig[] = [
    {
      id: "type",
      label: "Type",
      type: "multi-select",
      key: "type",
      options: [
        { value: "awarded", label: "Awarded" },
        { value: "redeemed", label: "Redeemed" },
        { value: "adjusted", label: "Adjusted" },
      ],
    },
    ...(riderOptions.length > 0
      ? [
          {
            id: "riderId",
            label: "Rider",
            type: "multi-select",
            key: "riderId",
            options: riderOptions,
          } as FilterConfig,
        ]
      : []),
    ...(campaignOptions.length > 0
      ? [
          {
            id: "campaignId",
            label: "Campaign",
            type: "multi-select",
            key: "campaignId",
            options: campaignOptions,
          } as FilterConfig,
        ]
      : []),
  ];

  return (
    <DataTableContainer
      data={transactions}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <RewardsTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
