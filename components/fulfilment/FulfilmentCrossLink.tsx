"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

/** Contextual Rewards → Fulfilment workflow shortcut. */
export function ActiveFulfilmentsCrossLink() {
  const { data, isLoading } = useFulfilmentQueue();
  const activeCount =
    data?.filter(
      (row) =>
        row.state !== "completed" &&
        row.state !== "cancelled" &&
        row.state !== "refunded" &&
        row.state !== "reversed" &&
        row.state !== "expired",
    ).length ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
          <Package className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium">Active fulfilments</p>
          <p className="text-xs text-muted-foreground">
            Operational execution after redemption — open Fulfilment for queue
            health and partner ops.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <p className="text-2xl font-semibold tabular-nums">
          {isLoading ? "—" : activeCount.toLocaleString()}
        </p>
        <Link
          href={FULFILMENT_ROUTES.root}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          View Fulfilment →
        </Link>
      </div>
    </div>
  );
}
