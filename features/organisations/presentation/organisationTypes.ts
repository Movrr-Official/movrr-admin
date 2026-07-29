import type { OrganisationType } from "@/features/organisations/domain/Organisation";
import {
  humanizeEnumToken,
  type OrganisationPresentation,
} from "./types";

const TYPE_PRESENTATION: Record<OrganisationType, OrganisationPresentation> = {
  reward_partner: {
    label: "Reward Partner",
    description: "Partner for reward collection and validation.",
    badgeVariant: "info",
  },
  advertiser: {
    label: "Advertiser",
    description: "Campaign and media partner organisation.",
    badgeVariant: "accent",
  },
  government: {
    label: "Government",
    description: "Public-sector organisation tenancy.",
    badgeVariant: "secondary",
  },
  movrr: {
    label: "MOVRR",
    description: "Internal MOVRR organisation.",
    badgeVariant: "default",
  },
};

export function getOrganisationTypePresentation(
  type: string,
): OrganisationPresentation {
  const known = TYPE_PRESENTATION[type as OrganisationType];
  if (known) return known;
  return {
    label: humanizeEnumToken(type),
    badgeVariant: "outline",
  };
}

export function formatOrganisationType(type: string): string {
  return getOrganisationTypePresentation(type).label;
}
