"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { FulfilmentQueueTable } from "@/components/rewards/fulfilment/FulfilmentQueueTable";
import { useFulfilmentQueue } from "@/hooks/useFulfilmentOpsData";
import { FULFILMENT_STATES } from "@/features/fulfilment/domain/states";
import { FULFILMENT_TYPES } from "@/features/fulfilment/domain/Fulfilment";
import {
  formatFulfilmentState,
  formatFulfilmentType,
} from "@/features/fulfilment/presentation";

const ALL = "__all__";

export default function FulfilmentOpsQueuePage() {
  const [status, setStatus] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);
  const [partnerOrgId, setPartnerOrgId] = useState("");

  const filters = useMemo(
    () => ({
      status: status === ALL ? undefined : status,
      type: type === ALL ? undefined : type,
      partnerOrgId: partnerOrgId.trim() || undefined,
    }),
    [status, type, partnerOrgId],
  );

  const { data, isLoading, isError, error, refetch, isFetching } =
    useFulfilmentQueue(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfilment Queue"
        description="Live operational queue from the Platform API. Filters are sent as query params — no client-side business rules."
        action={{
          label: isFetching ? "Refreshing…" : "Refresh",
          icon: <RefreshCw className="h-4 w-4" />,
          onClick: () => void refetch(),
          variant: "outline",
        }}
      />

      <Card className="border-border animate-slide-up">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fulfilment-status">State</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="fulfilment-status">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All States</SelectItem>
                {FULFILMENT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatFulfilmentState(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fulfilment-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="fulfilment-type">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Types</SelectItem>
                {FULFILMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatFulfilmentType(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fulfilment-partner">Partner Org ID</Label>
            <Input
              id="fulfilment-partner"
              value={partnerOrgId}
              onChange={(e) => setPartnerOrgId(e.target.value)}
              placeholder="Optional partnerOrgId"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border animate-slide-up">
        <CardContent className="pt-6">
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {(error as Error)?.message ?? "Failed to load queue"}
            </p>
          ) : (
            <FulfilmentQueueTable rows={data ?? []} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
