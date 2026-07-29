"use client";

import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FulfilmentQueueTable } from "@/components/rewards/fulfilment/FulfilmentQueueTable";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function CollectionsPage() {
  const awaiting = useFulfilmentQueue({ status: "awaiting_collection" });
  const collected = useFulfilmentQueue({ status: "collected" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clock3 className="h-6 w-6" />
            Collections
          </h1>
          <p className="text-sm text-muted-foreground">
            Partner collection workflow — awaiting confirmation and recently
            collected fulfilments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={FULFILMENT_ROUTES.partners}>Partner ops</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void awaiting.refetch();
              void collected.refetch();
            }}
            disabled={awaiting.isFetching || collected.isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Awaiting collection</CardTitle>
        </CardHeader>
        <CardContent>
          {awaiting.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(awaiting.error as Error)?.message ??
                "Failed to load awaiting collections"}
            </p>
          ) : (
            <FulfilmentQueueTable
              rows={awaiting.data ?? []}
              isLoading={awaiting.isLoading}
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Recently collected</CardTitle>
        </CardHeader>
        <CardContent>
          {collected.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(collected.error as Error)?.message ??
                "Failed to load collected fulfilments"}
            </p>
          ) : (
            <FulfilmentQueueTable
              rows={collected.data ?? []}
              isLoading={collected.isLoading}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
