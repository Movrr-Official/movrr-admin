import type { JSX } from "react";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";

export const OPS_NAV_GROUP_ID = "ops";

export interface NavItem {
  type?: "item";
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Capability-first visibility (any match). */
  capabilities: KnownCapability[];
  /**
   * @deprecated Role arrays removed from authorization path.
   * Retained optional for transitional tests only.
   */
  roles?: string[];
  badge: JSX.Element | null;
}

export interface NavGroup {
  type: "group";
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  capabilities: KnownCapability[];
  roles?: string[];
  children: NavItem[];
}

export interface NavSection {
  type: "section";
  name: string;
  capabilities: KnownCapability[];
  roles?: string[];
}

export type NavEntry = NavItem | NavGroup | NavSection;

export type OpsPanelOverride = "auto" | "root" | "ops";

export const isNavSection = (entry: NavEntry): entry is NavSection =>
  entry.type === "section";

export const isNavGroup = (entry: NavEntry): entry is NavGroup =>
  entry.type === "group";

export const isNavItem = (entry: NavEntry): entry is NavItem =>
  !isNavSection(entry) && !isNavGroup(entry);

export function isPathActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function hasAnyCapability(
  granted: ReadonlySet<string>,
  required: readonly KnownCapability[] | undefined,
): boolean {
  if (!required || required.length === 0) return false;
  return required.some((cap) => granted.has(cap));
}

/**
 * Filter navigation by granted capabilities (canonical path).
 */
export function filterNavigationByCapabilities(
  navigation: NavEntry[],
  capabilities: ReadonlySet<string> | readonly string[] | null | undefined,
): NavEntry[] {
  if (!capabilities) return [];
  const granted =
    capabilities instanceof Set ? capabilities : new Set(capabilities);

  return navigation
    .map((entry) => {
      if (isNavGroup(entry)) {
        const children = entry.children.filter((child) =>
          hasAnyCapability(granted, child.capabilities),
        );
        if (children.length === 0) return null;
        return { ...entry, children };
      }

      if (hasAnyCapability(granted, entry.capabilities)) return entry;
      return null;
    })
    .filter((entry): entry is NavEntry => entry !== null);
}

/**
 * @deprecated Use filterNavigationByCapabilities. Role filtering is a migration shim.
 */
export function filterNavigationByRole(
  navigation: NavEntry[],
  role: string | null | undefined,
): NavEntry[] {
  if (!role) return [];

  return navigation
    .map((entry) => {
      if (isNavGroup(entry)) {
        const children = entry.children.filter((child) =>
          child.roles ? child.roles.includes(role) : false,
        );
        if (children.length === 0) return null;
        return { ...entry, children };
      }

      if (entry.roles?.includes(role)) return entry;
      return null;
    })
    .filter((entry): entry is NavEntry => entry !== null);
}

export function findOpsGroup(navigation: NavEntry[]): NavGroup | null {
  const group = navigation.find(
    (entry): entry is NavGroup =>
      isNavGroup(entry) && entry.id === OPS_NAV_GROUP_ID,
  );
  return group ?? null;
}

export function collectOpsChildHrefs(opsGroup: NavGroup | null): string[] {
  return opsGroup?.children.map((child) => child.href) ?? [];
}

export function isOnOpsRoute(pathname: string, opsChildHrefs: string[]): boolean {
  return opsChildHrefs.some((href) => isPathActive(pathname, href));
}

export function resolveShowOpsPanel(input: {
  sidebarOpen: boolean;
  opsGroup: NavGroup | null;
  panelOverride: OpsPanelOverride;
  isOnOpsRoute: boolean;
}): boolean {
  if (!input.sidebarOpen || !input.opsGroup) return false;

  if (input.panelOverride === "ops") return true;
  if (input.panelOverride === "root") return false;
  return input.isOnOpsRoute;
}
