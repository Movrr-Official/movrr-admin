"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FulfilmentStateBadge } from "@/components/fulfilment/FulfilmentStateBadge";
import { FulfilmentTypeBadge } from "@/components/fulfilment/FulfilmentTypeBadge";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function FulfilmentTimelinePage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useFulfilmentQueue();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <History className="h-6 w-6" />
            Fulfilment timeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Recent operational states across the live queue — created through
            completed, refunded, and failed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Operational events</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load timeline"}
            </p>
          ) : isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading timeline…
            </p>
          ) : !data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No fulfilment events yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={FULFILMENT_ROUTES.detail(row.id)}
                        className="text-sm font-medium hover:underline"
                      >
                        {row.id}
                      </Link>
                      <FulfilmentTypeBadge type={row.fulfilmentType} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Redemption {row.redemptionId}
                      {row.partnerOrgId
                        ? ` · Partner ${row.partnerOrgId}`
                        : " · No partner"}
                      {row.completedAt
                        ? ` · Completed ${new Date(row.completedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  <FulfilmentStateBadge state={row.state} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
