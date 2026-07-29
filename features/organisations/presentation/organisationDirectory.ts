import type { Organisation } from "@/features/organisations/domain/Organisation";

export type OrganisationDirectoryKpis = {
  total: number;
  byType: Record<Organisation["type"], number>;
  active: number;
  inactive: number;
  suspended: number;
  withoutMembers: number;
};

export function computeOrganisationDirectoryKpis(
  orgs: Organisation[],
): OrganisationDirectoryKpis {
  const byType: Record<Organisation["type"], number> = {
    reward_partner: 0,
    advertiser: 0,
    government: 0,
    movrr: 0,
  };
  let active = 0;
  let inactive = 0;
  let suspended = 0;
  let withoutMembers = 0;

  for (const org of orgs) {
    byType[org.type] = (byType[org.type] ?? 0) + 1;
    if (org.status === "active") active += 1;
    if (org.status === "inactive") inactive += 1;
    if (org.status === "suspended") suspended += 1;
    if ((org.memberCount ?? 0) < 1) withoutMembers += 1;
  }

  return {
    total: orgs.length,
    byType,
    active,
    inactive,
    suspended,
    withoutMembers,
  };
}
