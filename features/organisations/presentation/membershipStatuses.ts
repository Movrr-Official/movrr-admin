import type { MembershipStatus } from "@/features/organisations/domain/Membership";
import {
  humanizeEnumToken,
  type OrganisationPresentation,
} from "./types";

const STATUS_PRESENTATION: Record<
  MembershipStatus,
  OrganisationPresentation
> = {
  active: {
    label: "Active",
    badgeVariant: "success",
  },
  invited: {
    label: "Invited",
    badgeVariant: "warning",
  },
  revoked: {
    label: "Revoked",
    badgeVariant: "destructive",
  },
};

export function getMembershipStatusPresentation(
  status: string,
): OrganisationPresentation {
  const known = STATUS_PRESENTATION[status as MembershipStatus];
  if (known) return known;
  return {
    label: humanizeEnumToken(status),
    badgeVariant: "outline",
  };
}

export function formatMembershipStatus(status: string): string {
  return getMembershipStatusPresentation(status).label;
}

export function formatBundleKey(bundleKey: string): string {
  return humanizeEnumToken(bundleKey);
}
