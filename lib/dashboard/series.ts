export interface TimeBucket {
  label: string;
  start: Date;
  end: Date;
}

interface UserLike {
  role?: string | null;
  createdAt?: string | null;
}

interface CampaignLike {
  startDate?: string | null;
  impressions?: number | null;
  spent?: number | null;
}

interface PointsTrendLike {
  date?: string | null;
  awarded: number;
  redeemed: number;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildCumulativeUserSeries(
  users: UserLike[],
  buckets: TimeBucket[],
  role: "rider" | "advertiser",
): Array<{ name: string; value: number }> {
  return buckets.reduce<Array<{ name: string; value: number }>>(
    (acc, bucket) => {
      const createdCount = users.filter((user) => {
        if (user.role !== role) return false;
        const createdAt = parseDate(user.createdAt);
        return createdAt
          ? createdAt >= bucket.start && createdAt <= bucket.end
          : false;
      }).length;
      const previousTotal = acc.length ? acc[acc.length - 1].value : 0;
      acc.push({ name: bucket.label, value: previousTotal + createdCount });
      return acc;
    },
    [],
  );
}

export function buildCampaignPerformanceSeries(
  campaigns: CampaignLike[],
  buckets: TimeBucket[],
): Array<{ name: string; impressions: number; revenue: number }> {
  return buckets.map((bucket) => {
    const monthlyCampaigns = campaigns.filter((campaign) => {
      const startDate = parseDate(campaign.startDate);
      return startDate
        ? startDate >= bucket.start && startDate <= bucket.end
        : false;
    });
    const impressions = monthlyCampaigns.reduce(
      (sum, campaign) => sum + Number(campaign.impressions ?? 0),
      0,
    );
    const revenue = monthlyCampaigns.reduce(
      (sum, campaign) => sum + Number(campaign.spent ?? 0),
      0,
    );
    return { name: bucket.label, impressions, revenue };
  });
}

interface RideModeTrendLike {
  date?: string | null;
  /** Points from standard_ride (Standard Ride) */
  standardRide: number;
  /** Points from ad_boost | campaign_ride (Boosted Ride) */
  campaignRide: number;
}

/**
 * Build a time-series for the Ride Mode split chart (Standard Ride vs Boosted Ride points).
 * Mirrors buildPointsTrendSeries — aggregate by bucket, not cumulative.
 */
export function buildRideModeSeries(
  trends: RideModeTrendLike[],
  buckets: TimeBucket[],
): Array<{ name: string; standardRide: number; campaignRide: number }> {
  return buckets.map((bucket) => {
    const periodTrends = trends.filter((trend) => {
      const date = parseDate(trend.date);
      return date ? date >= bucket.start && date <= bucket.end : false;
    });
    const standardRide = periodTrends.reduce(
      (sum, trend) => sum + trend.standardRide,
      0,
    );
    const campaignRide = periodTrends.reduce(
      (sum, trend) => sum + trend.campaignRide,
      0,
    );
    return { name: bucket.label, standardRide, campaignRide };
  });
}

export function buildPointsTrendSeries(
  trends: PointsTrendLike[],
  buckets: TimeBucket[],
): Array<{ name: string; awarded: number; redeemed: number }> {
  return buckets.map((bucket) => {
    const periodTrends = trends.filter((trend) => {
      const date = parseDate(trend.date);
      return date ? date >= bucket.start && date <= bucket.end : false;
    });
    const awarded = periodTrends.reduce((sum, trend) => sum + trend.awarded, 0);
    const redeemed = periodTrends.reduce(
      (sum, trend) => sum + trend.redeemed,
      0,
    );
    return { name: bucket.label, awarded, redeemed };
  });
}
