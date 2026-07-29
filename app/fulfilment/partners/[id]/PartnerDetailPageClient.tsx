"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PartnerStaffPanel } from "@/components/rewards/partners/PartnerStaffPanel";
import {
  useOrganisation,
  useOrganisationStaff,
} from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function PartnerDetailPageClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const organisation = useOrganisation(id);
  const staff = useOrganisationStaff(id);

  if (organisation.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading partner…
      </div>
    );
  }

  if (organisation.isError || !organisation.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={FULFILMENT_ROUTES.partners}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Partners
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {(organisation.error as Error)?.message ?? "Partner not found."}
        </p>
      </div>
    );
  }

  const org = organisation.data;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={FULFILMENT_ROUTES.partners}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Partners
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <Badge variant="outline">{org.type}</Badge>
          <Badge variant="secondary">{org.status}</Badge>
        </div>
        <p className="text-xs font-mono text-muted-foreground">{org.id}</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p>{new Date(org.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Updated</p>
            <p>{new Date(org.updatedAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Staff</CardTitle>
          <p className="text-sm text-muted-foreground">
            Invite and change roles through Platform API. Buttons hide nothing
            client-side beyond capability-gated API responses.
          </p>
        </CardHeader>
        <CardContent>
          <PartnerStaffPanel
            organisationId={id}
            staff={staff.data ?? []}
            isLoading={staff.isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
