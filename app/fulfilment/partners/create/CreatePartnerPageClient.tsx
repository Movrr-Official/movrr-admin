"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";
import { useCreateOrganisation } from "@/hooks/useOrganisationsData";
import { FULFILMENT_ROUTES } from "@/lib/adminIaRoutes";

export default function CreatePartnerPageClient() {
  const router = useRouter();
  const { toast } = useToast();
  const createOrganisation = useCreateOrganisation();
  const [name, setName] = useState("");

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Provide a reward partner organisation name.",
        variant: "destructive",
      });
      return;
    }

    try {
      const organisation = await createOrganisation.mutateAsync({
        name: name.trim(),
        type: "reward_partner",
      });
      toast({
        title: "Partner created",
        description: "Organisation created via Platform API.",
      });
      router.push(FULFILMENT_ROUTES.partnerDetail(organisation.id));
    } catch (error) {
      toast({
        title: "Create failed",
        description:
          error instanceof Error ? error.message : "Platform API request failed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={FULFILMENT_ROUTES.partners}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Partners
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Create reward partner</h1>
        <p className="text-sm text-muted-foreground">
          Creates an organisation with type `reward_partner` through Platform
          API.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Partner details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partner-name">Name</Label>
            <Input
              id="partner-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Partner organisation name"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={createOrganisation.isPending}
          >
            {createOrganisation.isPending ? "Creating…" : "Create partner"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
