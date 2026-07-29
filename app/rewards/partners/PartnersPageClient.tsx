"use client";

import Link from "next/link";
import { ArrowLeft, Handshake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrganisationListTable } from "@/components/rewards/organisations/OrganisationListTable";
import { useOrganisations } from "@/hooks/useOrganisationsData";

export default function PartnersPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations("reward_partner");

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/rewards">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Rewards
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Handshake className="h-6 w-6" />
              Reward partners
            </h1>
            <p className="text-sm text-muted-foreground">
              Organisations with type `reward_partner` via Platform API.
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
              <Link href="/rewards/partners/create">Create partner</Link>
            </Button>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Partners</CardTitle>
          </CardHeader>
          <CardContent>
            {isError ? (
              <p className="py-8 text-center text-sm text-destructive">
                {(error as Error)?.message ?? "Failed to load partners"}
              </p>
            ) : (
              <OrganisationListTable
                rows={data ?? []}
                isLoading={isLoading}
                detailHref={(org) => `/rewards/partners/${org.id}`}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
