"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useRewardStats } from "@/hooks/useRewardsData";
import { REWARDS_ROUTES } from "@/lib/adminIaRoutes";

/** Compact Fulfilment → Rewards workflow shortcut. */
export function TodaysRedemptionsCrossLink() {
  const { data: stats, isLoading } = useRewardStats();
  const redeemed = stats?.totalPointsRedeemed ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Programme Redemptions{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {isLoading ? "—" : redeemed.toLocaleString()}
          </span>
        </span>
      </div>
      <Link
        href={REWARDS_ROUTES.root}
        className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View Rewards →
      </Link>
    </div>
  );
}
