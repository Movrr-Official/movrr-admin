import { describe, expect, it } from "vitest";
import { LayoutDashboard, Landmark, Shield } from "lucide-react";
import {
  collectOpsChildHrefs,
  filterNavigationByCapabilities,
  filterNavigationByRole,
  findOpsGroup,
  isOnOpsRoute,
  isPathActive,
  OPS_NAV_GROUP_ID,
  resolveShowOpsPanel,
  type NavEntry,
  type NavGroup,
} from "@/components/layout/sidebarNavigation";
import {
  filterGeneratedNavigation,
  generateNavigationFromCapabilities,
} from "@/features/authorization/navigation";
import { capabilitiesForEmployeeRole } from "@/features/organisations/domain/employeeRoleTemplates";

const sampleNavigation: NavEntry[] = [
  {
    type: "item",
    name: "Overview",
    href: "/",
    icon: LayoutDashboard,
    capabilities: ["dashboard.read"],
    roles: ["admin", "super_admin", "compliance_officer"],
    badge: null,
  },
  {
    type: "group",
    id: OPS_NAV_GROUP_ID,
    name: "Ops",
    icon: Shield,
    capabilities: ["fraud.review", "programmes.read"],
    roles: ["admin", "super_admin", "compliance_officer", "government"],
    children: [
      {
        type: "item",
        name: "Fraud",
        href: "/fraud",
        icon: Shield,
        capabilities: ["fraud.review"],
        roles: ["admin", "super_admin"],
        badge: null,
      },
      {
        type: "item",
        name: "Programmes",
        href: "/programmes",
        icon: Landmark,
        capabilities: ["programmes.read"],
        roles: ["admin", "super_admin", "compliance_officer", "government"],
        badge: null,
      },
    ],
  },
];

describe("isPathActive", () => {
  it("matches exact root path only for home", () => {
    expect(isPathActive("/", "/")).toBe(true);
    expect(isPathActive("/fraud", "/")).toBe(false);
  });

  it("matches exact and nested paths for non-root routes", () => {
    expect(isPathActive("/fraud", "/fraud")).toBe(true);
    expect(isPathActive("/fraud/review", "/fraud")).toBe(true);
    expect(isPathActive("/fraudulent", "/fraud")).toBe(false);
  });
});

describe("filterNavigationByCapabilities", () => {
  it("returns empty navigation when capabilities are missing", () => {
    expect(filterNavigationByCapabilities(sampleNavigation, null)).toEqual([]);
  });

  it("filters ops children by capability while keeping the group shell", () => {
    const complianceCaps = capabilitiesForEmployeeRole("compliance_analyst");
    const complianceNav = filterNavigationByCapabilities(
      sampleNavigation,
      complianceCaps,
    );
    const opsGroup = findOpsGroup(complianceNav);

    expect(opsGroup?.children.map((child) => child.name)).toEqual([
      "Programmes",
    ]);
  });

  it("hides ops group when role has no visible children", () => {
    const supportCaps = capabilitiesForEmployeeRole("support_agent");
    const supportNav = filterNavigationByCapabilities(
      sampleNavigation,
      supportCaps,
    );
    expect(findOpsGroup(supportNav)).toBeNull();
  });
});

describe("filterNavigationByRole (legacy shim)", () => {
  it("still filters by role arrays when present", () => {
    const complianceNav = filterNavigationByRole(
      sampleNavigation,
      "compliance_officer",
    );
    expect(findOpsGroup(complianceNav)?.children.map((c) => c.name)).toEqual([
      "Programmes",
    ]);
  });
});

describe("generated capability navigation", () => {
  it("gives compliance_analyst programmes but not fraud", () => {
    const nav = filterGeneratedNavigation(
      generateNavigationFromCapabilities(),
      capabilitiesForEmployeeRole("compliance_analyst"),
    );
    const ops = nav.find((e) => e.type === "group");
    expect(ops?.type).toBe("group");
    if (ops?.type === "group") {
      expect(ops.children.map((c) => c.href)).toContain("/programmes");
      expect(ops.children.map((c) => c.href)).not.toContain("/fraud");
    }
  });

  it("aligns campaign_manager with campaigns nav", () => {
    const nav = filterGeneratedNavigation(
      generateNavigationFromCapabilities(),
      capabilitiesForEmployeeRole("campaign_manager"),
    );
    const hrefs = nav.flatMap((e) =>
      e.type === "group" ? e.children.map((c) => c.href) : [e.href],
    );
    expect(hrefs).toContain("/campaigns");
    expect(hrefs).not.toContain("/settings");
  });
});

describe("ops route helpers", () => {
  const opsGroup = findOpsGroup(sampleNavigation) as NavGroup;
  const opsHrefs = collectOpsChildHrefs(opsGroup);

  it("detects ops routes from child hrefs", () => {
    expect(isOnOpsRoute("/programmes", opsHrefs)).toBe(true);
    expect(isOnOpsRoute("/campaigns", opsHrefs)).toBe(false);
  });

  it("resolves ops panel visibility without init flash on ops routes", () => {
    expect(
      resolveShowOpsPanel({
        sidebarOpen: true,
        opsGroup,
        panelOverride: "auto",
        isOnOpsRoute: true,
      }),
    ).toBe(true);
  });

  it("honours explicit back navigation while staying on an ops route", () => {
    expect(
      resolveShowOpsPanel({
        sidebarOpen: true,
        opsGroup,
        panelOverride: "root",
        isOnOpsRoute: true,
      }),
    ).toBe(false);
  });

  it("opens ops panel manually from non-ops routes", () => {
    expect(
      resolveShowOpsPanel({
        sidebarOpen: true,
        opsGroup,
        panelOverride: "ops",
        isOnOpsRoute: false,
      }),
    ).toBe(true);
  });
});
