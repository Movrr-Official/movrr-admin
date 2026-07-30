import type { FulfilmentPresentation } from "./types";
import { humanizeEnumToken } from "./types";

/** Operator-facing inventory health for resource pools. */
export type ResourcePoolHealth = "healthy" | "low" | "exhausted" | "unknown";

const HEALTH_PRESENTATION: Record<ResourcePoolHealth, FulfilmentPresentation> = {
  healthy: {
    label: "Healthy",
    description: "Available inventory is in a normal range.",
    badgeVariant: "success",
  },
  low: {
    label: "Low",
    description: "Available inventory is running low.",
    badgeVariant: "warning",
  },
  exhausted: {
    label: "Exhausted",
    description: "No available inventory remains.",
    badgeVariant: "destructive",
  },
  unknown: {
    label: "Unknown",
    description: "Health could not be determined from the read model.",
    badgeVariant: "secondary",
  },
};

const KIND_LABELS: Record<string, string> = {
  voucher_pool: "Voucher Pool",
  generated_digital: "Generated Digital",
  external_partner: "External Partner",
};

const STATUS_PRESENTATION: Record<string, FulfilmentPresentation> = {
  active: {
    label: "Active",
    badgeVariant: "success",
  },
  inactive: {
    label: "Inactive",
    badgeVariant: "secondary",
  },
  depleted: {
    label: "Depleted",
    badgeVariant: "destructive",
  },
};

export function deriveResourcePoolHealth(input: {
  availableCount?: number | null;
  exhausted?: boolean | null;
  health?: string | null;
}): ResourcePoolHealth {
  if (input.exhausted === true) return "exhausted";
  if (typeof input.availableCount === "number") {
    if (input.availableCount <= 0) return "exhausted";
    if (input.availableCount <= 10) return "low";
    return "healthy";
  }
  const raw = input.health?.trim().toLowerCase();
  if (raw === "ok" || raw === "healthy") return "healthy";
  if (raw === "low" || raw === "warning") return "low";
  if (raw === "exhausted" || raw === "depleted" || raw === "empty") {
    return "exhausted";
  }
  return "unknown";
}

export function getResourcePoolHealthPresentation(
  health: string | null | undefined,
): FulfilmentPresentation {
  const key = (health as ResourcePoolHealth) ?? "unknown";
  return (
    HEALTH_PRESENTATION[key] ?? {
      label: humanizeEnumToken(health ?? "unknown"),
      badgeVariant: "secondary",
    }
  );
}

export function formatResourcePoolHealth(
  health: string | null | undefined,
): string {
  return getResourcePoolHealthPresentation(health).label;
}

export function formatResourceKind(kind: string | null | undefined): string {
  if (!kind) return "Not set";
  return KIND_LABELS[kind] ?? humanizeEnumToken(kind);
}

export function getResourceStatusPresentation(
  status: string | null | undefined,
): FulfilmentPresentation {
  if (!status) {
    return { label: "Not set", badgeVariant: "outline" };
  }
  return (
    STATUS_PRESENTATION[status] ?? {
      label: humanizeEnumToken(status),
      badgeVariant: "secondary",
    }
  );
}

export function formatResourceStatus(status: string | null | undefined): string {
  return getResourceStatusPresentation(status).label;
}
