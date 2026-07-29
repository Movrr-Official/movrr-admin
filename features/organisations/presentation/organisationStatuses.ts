import type { OrganisationStatus } from "@/features/organisations/domain/Organisation";
import {
  humanizeEnumToken,
  type OrganisationPresentation,
} from "./types";

const STATUS_PRESENTATION: Record<
  OrganisationStatus,
  OrganisationPresentation
> = {
  active: {
    label: "Active",
    badgeVariant: "success",
  },
  inactive: {
    label: "Inactive",
    badgeVariant: "secondary",
  },
  suspended: {
    label: "Suspended",
    badgeVariant: "destructive",
  },
};

export function getOrganisationStatusPresentation(
  status: string,
): OrganisationPresentation {
  const known = STATUS_PRESENTATION[status as OrganisationStatus];
  if (known) return known;
  return {
    label: humanizeEnumToken(status),
    badgeVariant: "outline",
  };
}

export function formatOrganisationStatus(status: string): string {
  return getOrganisationStatusPresentation(status).label;
}
