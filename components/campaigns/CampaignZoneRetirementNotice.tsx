import React from "react";
import { Badge } from "@/components/ui/badge";

export function CampaignZoneRetirementNotice({ retiredAt, reason }: { retiredAt?: string | null; reason?: string | null }) {
  if (!retiredAt) return null;
  return <div role="status" className="space-y-1 text-sm">
    <Badge variant="secondary">Retired — historical area</Badge>
    <p>{reason}</p>
    <p className="text-muted-foreground">Retired {new Date(retiredAt).toLocaleString()}. Original geometry retained; excluded from current operating areas.</p>
  </div>;
}
