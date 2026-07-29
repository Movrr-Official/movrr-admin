"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

/** Compact Rewards → Fulfilment workflow shortcut. */
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Active Fulfilments{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {isLoading ? "—" : activeCount.toLocaleString()}
          </span>
        </span>
      </div>
      <Link
        href={FULFILMENT_ROUTES.root}
        className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View Fulfilment →
      </Link>
    </div>
  );
}
