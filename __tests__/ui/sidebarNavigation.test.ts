import { describe, expect, it } from "vitest";
import { LayoutDashboard, Landmark, Shield } from "lucide-react";
import {
  collectOpsChildHrefs,
  filterNavigationByRole,
  findOpsGroup,
  isOnOpsRoute,
  isPathActive,
  OPS_NAV_GROUP_ID,
  resolveShowOpsPanel,
  type NavEntry,
  type NavGroup,
} from "@/components/layout/sidebarNavigation";

const sampleNavigation: NavEntry[] = [
  {
    type: "item",
    name: "Overview",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "super_admin", "compliance_officer"],
    badge: null,
  },
  {
    type: "group",
    id: OPS_NAV_GROUP_ID,
    name: "Ops",
    icon: Shield,
    roles: ["admin", "super_admin", "compliance_officer", "government"],
    children: [
      {
        type: "item",
        name: "Fraud",
        href: "/fraud",
        icon: Shield,
        roles: ["admin", "super_admin"],
        badge: null,
      },
      {
        type: "item",
        name: "Programmes",
        href: "/programmes",
        icon: Landmark,
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

describe("filterNavigationByRole", () => {
  it("returns empty navigation when role is missing", () => {
    expect(filterNavigationByRole(sampleNavigation, null)).toEqual([]);
  });

  it("filters ops children by role while keeping the group shell", () => {
    const complianceNav = filterNavigationByRole(
      sampleNavigation,
      "compliance_officer",
    );
    const opsGroup = findOpsGroup(complianceNav);

    expect(opsGroup?.children.map((child) => child.name)).toEqual([
      "Programmes",
    ]);
  });

  it("hides ops group when role has no visible children", () => {
    const moderatorNav = filterNavigationByRole(sampleNavigation, "moderator");
    expect(findOpsGroup(moderatorNav)).toBeNull();
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
