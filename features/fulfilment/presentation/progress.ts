import type { RiderProgress } from "@/features/fulfilment/domain/progress";
import {
  humanizeEnumToken,
  type FulfilmentPresentation,
} from "./types";

const PROGRESS_PRESENTATION: Record<RiderProgress, FulfilmentPresentation> = {
  preparing: {
    label: "Preparing",
    description: "Reward is being prepared.",
    badgeVariant: "info",
  },
  ready: {
    label: "Ready",
    description: "Reward is ready for the rider.",
    badgeVariant: "accent",
  },
  awaiting_collection: {
    label: "Awaiting Collection",
    description: "Waiting for collection or confirmation.",
    badgeVariant: "warning",
  },
  completed: {
    label: "Completed",
    description: "Rider-facing fulfilment is complete.",
    badgeVariant: "success",
  },
  unavailable: {
    label: "Unavailable",
    description: "Reward is no longer available.",
    badgeVariant: "outline",
  },
};

export function getRiderProgressPresentation(
  progress: string | null | undefined,
): FulfilmentPresentation {
  if (!progress) {
    return {
      label: "Unknown",
      badgeVariant: "outline",
    };
  }
  return (
    PROGRESS_PRESENTATION[progress as RiderProgress] ?? {
      label: humanizeEnumToken(progress),
      badgeVariant: "secondary" as const,
    }
  );
}

export function formatRiderProgress(
  progress: string | null | undefined,
): string {
  return getRiderProgressPresentation(progress).label;
}
