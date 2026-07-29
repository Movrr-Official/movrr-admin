"use client";

import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { FulfilmentQueueTable } from "@/components/rewards/fulfilment/FulfilmentQueueTable";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function CollectionsPage() {
  const awaiting = useFulfilmentQueue({ status: "awaiting_collection" });
  const collected = useFulfilmentQueue({ status: "collected" });
  const isFetching = awaiting.isFetching || collected.isFetching;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Partner collection workflow — awaiting confirmation and recently collected fulfilments."
        actions={[
          {
            label: "Partner Ops",
            href: FULFILMENT_ROUTES.partners,
            variant: "outline",
          },
          {
            label: isFetching ? "Refreshing…" : "Refresh",
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: () => {
              void awaiting.refetch();
              void collected.refetch();
            },
            variant: "outline",
          },
        ]}
      />

      <Card className="border-border animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">Awaiting Collection</CardTitle>
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

      <Card
        className="border-border animate-slide-up"
        style={{ animationDelay: "0.05s" }}
      >
        <CardHeader>
          <CardTitle className="text-lg">Recently Collected</CardTitle>
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
