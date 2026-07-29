"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { OrganisationListTable } from "@/components/rewards/organisations/OrganisationListTable";
import { OrganisationDetailsDrawer } from "@/components/rewards/organisations/OrganisationDetailsDrawer";
import { useOrganisations } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function OrganisationsPageClient() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useOrganisations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  const setSelectedId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("id", id);
      else params.delete("id");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisations"
        description="Organisation directory for fulfilment tenancy and partner ops."
        actions={[
          {
            label: isFetching ? "Refreshing…" : "Refresh",
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: () => void refetch(),
            variant: "outline",
          },
          {
            label: "Create Partner",
            href: FULFILMENT_ROUTES.partnerCreate,
            icon: <Plus className="h-4 w-4" />,
          },
        ]}
      />

      <Card className="border-border animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">All Organisations</CardTitle>
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
              onSelectOrg={(org) => setSelectedId(org.id)}
            />
          )}
        </CardContent>
      </Card>

      <OrganisationDetailsDrawer
        organisationId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        title="Organisation Details"
      />
    </div>
  );
}
