import { CampaignAnalyticsData, StatCard } from "@/types/types";
import { Eye, Clock, Bike, Activity } from "lucide-react";

type CityEngagement = {
  city: string;
  engagement: number;
  campaigns: number;
};

type DailyImpression = {
  date: string;
  impressions: number;
};

type RiderAllocation = {
  name: string;
  value: number;
  color: string;
};

export const getCampaignAnalytics = (seed: number = 1) => {
  // Random multipliers to simulate variation
  const multiplier = seed * 1000;

  const stats: StatCard[] = [
    {
      title: "Total Impressions",
      value: 30000 + multiplier,
      format: (val) => val.toLocaleString(),
      change: { value: 10 + seed, type: "increase" },
      icon: Eye,
    },
    {
      title: "Avg Duration",
      value: 25 + seed,
      format: (val) => `${val} days`,
      change: { value: 2.5 + seed / 2, type: "increase" },
      icon: Clock,
    },
    {
      title: "Active Riders",
      value: 15 + seed * 2,
      change: {
        value: -(1.5 + seed / 2),
        type: "decrease",
      },
      icon: Bike,
    },
    {
      title: "Avg Engagement",
      value: 4.5 + seed * 0.1,
      format: (val) => `${val.toFixed(1)}%`,
      change: {
        value: +(1.2 + seed * 0.5).toFixed(1),
        type: "increase",
      },
      icon: Activity,
    },
  ];

  const engagementByCity: CityEngagement[] = [
    { city: "Amsterdam", engagement: 4.8 + seed * 0.1, campaigns: 3 },
    { city: "Rotterdam", engagement: 5.2 + seed * 0.1, campaigns: 2 },
    { city: "Utrecht", engagement: 3.9 + seed * 0.1, campaigns: 2 },
    { city: "The Hague", engagement: 4.1 + seed * 0.1, campaigns: 2 },
    { city: "Eindhoven", engagement: 5.2 + seed * 0.1, campaigns: 1 },
  ];

  const dailyImpressions: DailyImpression[] = [
    { date: "Mon", impressions: 2000 + seed * 100 },
    { date: "Tue", impressions: 2200 + seed * 100 },
    { date: "Wed", impressions: 2600 + seed * 150 },
    { date: "Thu", impressions: 2300 + seed * 130 },
    { date: "Fri", impressions: 2800 + seed * 170 },
    { date: "Sat", impressions: 3000 + seed * 200 },
    { date: "Sun", impressions: 3100 + seed * 210 },
  ];

  const riderAllocation: RiderAllocation[] = [
    { name: "Available", value: 10 + seed, color: "#10b981" },
    { name: "Assigned", value: 20 + seed * 2, color: "#3b82f6" },
    { name: "On Route", value: 8 + seed, color: "#f59e0b" },
    { name: "Maintenance", value: 2 + seed, color: "#ef4444" },
  ];

  return {
    stats,
    engagementByCity,
    dailyImpressions,
    riderAllocation,
  };
};

export const mergeCampaignAnalytics = (
  analytics: CampaignAnalyticsData[]
): CampaignAnalyticsData => {
  if (analytics.length === 0) {
    return {
      stats: [],
      engagementByCity: [],
      dailyImpressions: [],
      riderAllocation: [],
    };
  }

  if (analytics.length === 1) return analytics[0];

  // Merge stats by title, summing values and changes
  const statMap: Record<string, StatCard> = {};

  analytics.forEach(({ stats }) => {
    stats.forEach((item) => {
      if (!statMap[item.title]) {
        statMap[item.title] = { ...item };
        // If change exists, clone it to avoid mutation
        if (item.change) {
          statMap[item.title].change = { ...item.change };
        }
      } else {
        statMap[item.title].value =
          Number(statMap[item.title].value) + Number(item.value);
        if (item.change && statMap[item.title].change) {
          statMap[item.title].change!.value += item.change.value;
        }
      }
    });
  });

  const stats = Object.values(statMap);

  // Merge engagementByCity
  const engagementByCityMap: Record<
    string,
    { engagement: number; campaigns: number }
  > = {};
  analytics.forEach(({ engagementByCity }) => {
    engagementByCity.forEach(({ city, engagement, campaigns }) => {
      if (!engagementByCityMap[city]) {
        engagementByCityMap[city] = { engagement: 0, campaigns: 0 };
      }
      engagementByCityMap[city].engagement += engagement;
      engagementByCityMap[city].campaigns += campaigns;
    });
  });

  const engagementByCity = Object.entries(engagementByCityMap).map(
    ([city, data]) => ({
      city,
      engagement: data.engagement,
      campaigns: data.campaigns,
    })
  );

  // Merge daily campaign impressions
  const dailyCampaignImpressionsMap: Record<string, number> = {};
  analytics.forEach(({ dailyImpressions }) => {
    dailyImpressions.forEach(({ date, impressions }) => {
      dailyCampaignImpressionsMap[date] =
        (dailyCampaignImpressionsMap[date] || 0) + impressions;
    });
  });

  const dailyCampaignImpressions = Object.entries(
    dailyCampaignImpressionsMap
  ).map(([date, impressions]) => ({ date, impressions }));

  // Merge rider allocation
  const riderAllocationMap: Record<string, number> = {};
  analytics.forEach(({ riderAllocation }) => {
    riderAllocation.forEach(({ name, value }) => {
      riderAllocationMap[name] = (riderAllocationMap[name] || 0) + value;
    });
  });

  const riderAllocation = Object.entries(riderAllocationMap).map(
    ([name, value]) => {
      // Find the color from the first analytics entry that has this rider allocation name
      const color =
        analytics
          .map((a) => a.riderAllocation.find((r) => r.name === name)?.color)
          .find((c) => c !== undefined) || "#000000";
      return { name, value, color };
    }
  );

  return {
    stats,
    engagementByCity,
    dailyImpressions: dailyCampaignImpressions,
    riderAllocation,
  };
};
