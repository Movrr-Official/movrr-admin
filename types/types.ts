import { LucideIcon } from "lucide-react";

export interface CampaignAnalyticsData {
  stats: StatCard[];
  engagementByCity: EngagementByCity[];
  dailyImpressions: DailyImpression[];
  riderAllocation: RiderAllocation[];
}

export interface DailyImpression {
  date: string; // e.g. "2023-10-01"
  impressions: number;
}

export interface EngagementByCity {
  city: string;
  engagement: number;
  campaigns: number;
}

export interface RiderAllocation {
  name: string;
  value: number;
  color: string; // hex code or CSS color string
}

interface StatCardChange {
  value: number;
  type: "increase" | "decrease";
}

export interface StatCard {
  title: string;
  value: number;
  change: StatCardChange;
  icon: LucideIcon;
  format?: (value: number) => string;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  city: string;
  status: "pending" | "approved" | "rejected";
  bike_ownership: "yes" | "no" | "planning";
  created_at: string;
}
