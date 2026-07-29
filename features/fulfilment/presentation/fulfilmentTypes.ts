import {
  Gift,
  HeartHandshake,
  QrCode,
  Sparkles,
  Ticket,
  Truck,
  Wand2,
  Zap,
} from "lucide-react";
import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";
import {
  humanizeEnumToken,
  type FulfilmentPresentation,
} from "./types";

const TYPE_PRESENTATION: Record<FulfilmentType, FulfilmentPresentation> = {
  instant_digital: {
    label: "Instant Digital",
    description: "Digital code or voucher delivered immediately.",
    badgeVariant: "accent",
    icon: Zap,
  },
  qr_barcode: {
    label: "QR / Barcode",
    description: "Scannable code for partner validation and collection.",
    badgeVariant: "info",
    icon: QrCode,
  },
  physical_collection: {
    label: "Physical Collection",
    description: "Rider collects the reward in person.",
    badgeVariant: "secondary",
    icon: Gift,
  },
  physical_shipping: {
    label: "Physical Shipping",
    description: "Reward is shipped to the rider.",
    badgeVariant: "secondary",
    icon: Truck,
  },
  event_ticket: {
    label: "Event Ticket",
    description: "Admission or event access fulfilment.",
    badgeVariant: "accent",
    icon: Ticket,
  },
  sweepstakes: {
    label: "Sweepstakes",
    description: "Entry into a prize draw or sweepstakes.",
    badgeVariant: "warning",
    icon: Sparkles,
  },
  donation: {
    label: "Donation",
    description: "Points converted into a charitable donation.",
    badgeVariant: "success",
    icon: HeartHandshake,
  },
  premium_feature: {
    label: "Premium Feature",
    description: "Unlocks a premium product capability.",
    badgeVariant: "accent",
    icon: Wand2,
  },
};

export function getFulfilmentTypePresentation(
  type: string | null | undefined,
): FulfilmentPresentation {
  if (!type) {
    return {
      label: "Not set",
      badgeVariant: "outline",
    };
  }
  return (
    TYPE_PRESENTATION[type as FulfilmentType] ?? {
      label: humanizeEnumToken(type),
      badgeVariant: "secondary" as const,
    }
  );
}

export function formatFulfilmentType(type: string | null | undefined): string {
  return getFulfilmentTypePresentation(type).label;
}
