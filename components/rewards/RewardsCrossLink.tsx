"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useRewardStats } from "@/hooks/useRewardsData";
import { REWARDS_ROUTES } from "@/lib/adminIaRoutes";

/** Contextual Fulfilment → Rewards workflow shortcut. */
export function TodaysRedemptionsCrossLink() {
  const { data: stats, isLoading } = useRewardStats();
  const redeemed = stats?.totalPointsRedeemed ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
          <Coins className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium">Programme redemptions</p>
          <p className="text-xs text-muted-foreground">
            Commercial ledger activity that seeds fulfilment — open Rewards for
            catalog, wallet, and redemption analytics.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <p className="text-2xl font-semibold tabular-nums">
          {isLoading ? "—" : redeemed.toLocaleString()}
        </p>
        <Link
          href={REWARDS_ROUTES.root}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          View Rewards →
        </Link>
      </div>
    </div>
  );
}
