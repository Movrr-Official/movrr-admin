import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";
import {
  humanizeEnumToken,
  type OrganisationPresentation,
} from "./types";

const ROLE_PRESENTATION: Record<MembershipRole, OrganisationPresentation> = {
  owner: {
    label: "Owner",
    description: "Full partner workspace administration.",
    badgeVariant: "default",
  },
  manager: {
    label: "Manager",
    description: "Operational management without staff admin.",
    badgeVariant: "info",
  },
  staff: {
    label: "Staff",
    description: "Validate and confirm fulfilment operations.",
    badgeVariant: "secondary",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only partner workspace access.",
    badgeVariant: "outline",
  },
};

export function getMembershipRolePresentation(
  role: string,
): OrganisationPresentation {
  const known = ROLE_PRESENTATION[role as MembershipRole];
  if (known) return known;
  return {
    label: humanizeEnumToken(role),
    badgeVariant: "outline",
  };
}

export function formatMembershipRole(role: string): string {
  return getMembershipRolePresentation(role).label;
}
