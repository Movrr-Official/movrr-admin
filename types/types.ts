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

export interface PerformanceChartDatum {
  name: string;
  impressions: number;
  revenue: number;
}

export interface PerformanceChartProps {
  data?: PerformanceChartDatum[];
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
  status_reason?: string | null;
  converted_to_user?: boolean;
  bike_ownership: "own" | "interested" | "planning" | null;
  audience: "rider" | "brand" | "partner" | null;
  source: "movrr_website" | "movrr_waitlist" | null;
  acquisition_channel: string | null;
  country_code: string | null;
  geo_city: string | null;
  created_at: string;
  updated_at?: string;
}
