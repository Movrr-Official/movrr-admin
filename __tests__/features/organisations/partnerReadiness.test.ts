import { describe, expect, it } from "vitest";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import {
  assessPartnerReadiness,
  computePartnerFleetKpis,
  readinessSortRank,
} from "@/features/organisations/presentation/partnerReadiness";
import { computeOrganisationDirectoryKpis } from "@/features/organisations/presentation/organisationDirectory";

function partner(overrides: Partial<Organisation> = {}): Organisation {
  return {
    id: "org-1",
    name: "Cafe MOVRR",
    type: "reward_partner",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    activeMemberCount: 1,
    memberCount: 1,
    partnerProfile: {
      id: "rp-1",
      name: "Cafe MOVRR",
      website: "https://example.com",
      logoUrl: null,
      contactEmail: "ops@example.com",
      status: "active",
      organisationId: "org-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("assessPartnerReadiness", () => {
  it("marks fully staffed active partners with contact as ready", () => {
    const result = assessPartnerReadiness(partner());
    expect(result.readiness).toBe("ready");
    expect(result.reasons).toEqual([]);
  });

  it("marks suspended partners not ready", () => {
    const result = assessPartnerReadiness(partner({ status: "suspended" }));
    expect(result.readiness).toBe("not_ready");
    expect(result.reasons[0]).toMatch(/suspended/i);
  });

  it("marks missing staff as not ready", () => {
    const result = assessPartnerReadiness(
      partner({ activeMemberCount: 0, memberCount: 0 }),
    );
    expect(result.readiness).toBe("not_ready");
    expect(result.missingStaff).toBe(true);
  });

  it("marks missing contact as at risk when otherwise operable", () => {
    const result = assessPartnerReadiness(
      partner({
        partnerProfile: {
          id: "rp-1",
          name: "Cafe MOVRR",
          website: null,
          logoUrl: null,
          contactEmail: null,
          status: "active",
          organisationId: "org-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    expect(result.readiness).toBe("at_risk");
    expect(result.profileIncomplete).toBe(true);
  });
});

describe("fleet and directory KPIs", () => {
  it("computes partner fleet KPIs", () => {
    const kpis = computePartnerFleetKpis([
      partner(),
      partner({
        id: "org-2",
        status: "suspended",
        activeMemberCount: 0,
        memberCount: 0,
        partnerProfile: null,
      }),
    ]);
    expect(kpis.total).toBe(2);
    expect(kpis.ready).toBe(1);
    expect(kpis.notReady).toBe(1);
    expect(kpis.suspended).toBe(1);
  });

  it("computes organisation directory KPIs by type", () => {
    const kpis = computeOrganisationDirectoryKpis([
      partner(),
      {
        id: "adv-1",
        name: "Ads Co",
        type: "advertiser",
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        memberCount: 0,
        activeMemberCount: 0,
      },
    ]);
    expect(kpis.total).toBe(2);
    expect(kpis.byType.reward_partner).toBe(1);
    expect(kpis.byType.advertiser).toBe(1);
    expect(kpis.withoutMembers).toBe(1);
  });

  it("sorts not_ready before ready", () => {
    expect(readinessSortRank("not_ready")).toBeLessThan(
      readinessSortRank("ready"),
    );
  });
});
