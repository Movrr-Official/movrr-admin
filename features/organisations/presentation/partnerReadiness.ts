import type { Organisation } from "@/features/organisations/domain/Organisation";
import type { OrganisationPresentation } from "./types";

/** Product readiness posture for Partner Operations (design contract). */
export type PartnerReadiness = "ready" | "at_risk" | "not_ready";

export type PartnerReadinessAssessment = {
  readiness: PartnerReadiness;
  missingStaff: boolean;
  profileIncomplete: boolean;
  reasons: string[];
};

function hasUsableContact(org: Organisation): boolean {
  const email = org.partnerProfile?.contactEmail?.trim();
  return Boolean(email);
}

function hasLinkedProfile(org: Organisation): boolean {
  return Boolean(org.partnerProfile?.id);
}

/**
 * Derives fulfilment readiness from Organisation + optional membership counts
 * and partner profile enrichment. Does not invent engine/queue health.
 */
export function assessPartnerReadiness(
  org: Organisation,
): PartnerReadinessAssessment {
  const reasons: string[] = [];
  const activeMembers = org.activeMemberCount ?? 0;
  const missingStaff = activeMembers < 1;
  const profileIncomplete = !hasLinkedProfile(org) || !hasUsableContact(org);

  if (org.status === "suspended") {
    reasons.push("Partner is suspended");
    return {
      readiness: "not_ready",
      missingStaff,
      profileIncomplete,
      reasons,
    };
  }

  if (org.status === "inactive") {
    reasons.push("Partner is inactive");
    return {
      readiness: "not_ready",
      missingStaff,
      profileIncomplete,
      reasons,
    };
  }

  if (missingStaff) {
    reasons.push("No active staff for Business Workspace");
  }
  if (!hasLinkedProfile(org)) {
    reasons.push("Partner catalog profile not linked");
  } else if (!hasUsableContact(org)) {
    reasons.push("Contact email missing");
  }

  if (missingStaff) {
    return {
      readiness: "not_ready",
      missingStaff,
      profileIncomplete,
      reasons,
    };
  }

  if (profileIncomplete) {
    return {
      readiness: "at_risk",
      missingStaff,
      profileIncomplete,
      reasons,
    };
  }

  return {
    readiness: "ready",
    missingStaff: false,
    profileIncomplete: false,
    reasons: [],
  };
}

const READINESS_PRESENTATION: Record<
  PartnerReadiness,
  OrganisationPresentation
> = {
  ready: {
    label: "Ready",
    description: "Active, staffed, and contactable for fulfilment.",
    badgeVariant: "success",
  },
  at_risk: {
    label: "At risk",
    description: "Participating but profile or contact gaps remain.",
    badgeVariant: "warning",
  },
  not_ready: {
    label: "Not ready",
    description: "Cannot safely participate in collection or validation.",
    badgeVariant: "destructive",
  },
};

export function getPartnerReadinessPresentation(
  readiness: PartnerReadiness,
): OrganisationPresentation {
  return READINESS_PRESENTATION[readiness];
}

export function formatPartnerReadiness(readiness: PartnerReadiness): string {
  return READINESS_PRESENTATION[readiness].label;
}

export function readinessSortRank(readiness: PartnerReadiness): number {
  switch (readiness) {
    case "not_ready":
      return 0;
    case "at_risk":
      return 1;
    case "ready":
      return 2;
  }
}

export type PartnerFleetKpis = {
  total: number;
  active: number;
  ready: number;
  atRisk: number;
  notReady: number;
  missingStaff: number;
  suspended: number;
  profileIncomplete: number;
};

export function computePartnerFleetKpis(
  orgs: Organisation[],
): PartnerFleetKpis {
  const kpis: PartnerFleetKpis = {
    total: orgs.length,
    active: 0,
    ready: 0,
    atRisk: 0,
    notReady: 0,
    missingStaff: 0,
    suspended: 0,
    profileIncomplete: 0,
  };

  for (const org of orgs) {
    if (org.status === "active") kpis.active += 1;
    if (org.status === "suspended") kpis.suspended += 1;
    const assessment = assessPartnerReadiness(org);
    if (assessment.readiness === "ready") kpis.ready += 1;
    if (assessment.readiness === "at_risk") kpis.atRisk += 1;
    if (assessment.readiness === "not_ready") kpis.notReady += 1;
    if (assessment.missingStaff) kpis.missingStaff += 1;
    if (assessment.profileIncomplete) kpis.profileIncomplete += 1;
  }

  return kpis;
}
