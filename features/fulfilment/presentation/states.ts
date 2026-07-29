import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Package,
  PackageCheck,
  RefreshCcw,
  ShieldAlert,
  Truck,
  Undo2,
} from "lucide-react";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import {
  humanizeEnumToken,
  type FulfilmentPresentation,
} from "./types";

const STATE_PRESENTATION: Record<FulfilmentState, FulfilmentPresentation> = {
  created: {
    label: "Created",
    description: "Fulfilment record created after redemption.",
    badgeVariant: "secondary",
    icon: Package,
  },
  reserved: {
    label: "Reserved",
    description: "Resource capacity reserved for this fulfilment.",
    badgeVariant: "info",
    icon: Clock3,
  },
  processing: {
    label: "Processing",
    description: "Fulfilment is being prepared.",
    badgeVariant: "info",
    icon: RefreshCcw,
  },
  ready: {
    label: "Ready",
    description: "Ready for the rider or partner next step.",
    badgeVariant: "accent",
    icon: CheckCircle2,
  },
  awaiting_collection: {
    label: "Awaiting Collection",
    description: "Waiting for partner or rider collection.",
    badgeVariant: "warning",
    icon: Clock3,
  },
  collected: {
    label: "Collected",
    description: "Collection confirmed.",
    badgeVariant: "success",
    icon: PackageCheck,
  },
  dispatched: {
    label: "Dispatched",
    description: "Shipment has been dispatched.",
    badgeVariant: "info",
    icon: Truck,
  },
  delivered: {
    label: "Delivered",
    description: "Shipment marked delivered.",
    badgeVariant: "success",
    icon: PackageCheck,
  },
  validated: {
    label: "Validated",
    description: "Token or code validated successfully.",
    badgeVariant: "accent",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completed",
    description: "Fulfilment finished successfully.",
    badgeVariant: "success",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    description: "Fulfilment cancelled before completion.",
    badgeVariant: "outline",
    icon: Ban,
  },
  failed: {
    label: "Failed",
    description: "Fulfilment failed and needs attention.",
    badgeVariant: "destructive",
    icon: ShieldAlert,
  },
  expired: {
    label: "Expired",
    description: "Fulfilment expired before completion.",
    badgeVariant: "warning",
    icon: AlertTriangle,
  },
  refunded: {
    label: "Refunded",
    description: "Wallet refund issued for this fulfilment.",
    badgeVariant: "warning",
    icon: Undo2,
  },
  reversed: {
    label: "Reversed",
    description: "Fulfilment outcome was reversed.",
    badgeVariant: "outline",
    icon: Undo2,
  },
};

export function getFulfilmentStatePresentation(
  state: string | null | undefined,
): FulfilmentPresentation {
  if (!state) {
    return {
      label: "Unknown",
      badgeVariant: "outline",
    };
  }
  return (
    STATE_PRESENTATION[state as FulfilmentState] ?? {
      label: humanizeEnumToken(state),
      badgeVariant: "secondary" as const,
    }
  );
}

export function formatFulfilmentState(
  state: string | null | undefined,
): string {
  return getFulfilmentStatePresentation(state).label;
}
