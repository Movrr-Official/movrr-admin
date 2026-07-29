"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrganisationListTable } from "@/components/rewards/organisations/OrganisationListTable";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function OrganisationsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Organisations
          </h1>
          <p className="text-sm text-muted-foreground">
            Organisation directory for fulfilment tenancy and partner ops.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href={FULFILMENT_ROUTES.partnerCreate}>Create partner</Link>
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">All organisations</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load organisations"}
            </p>
          ) : (
            <OrganisationListTable
              rows={data ?? []}
              isLoading={isLoading}
              detailHref={(org) =>
                org.type === "reward_partner"
                  ? FULFILMENT_ROUTES.partnerDetail(org.id)
                  : FULFILMENT_ROUTES.organisations
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
