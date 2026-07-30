/**
 * Navigation generation from the Dashboard Capability Registry.
 * Sidebar must not maintain independent role allow-lists.
 */

import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";
import {
  getNavigationSurfaces,
  type DashboardCapabilitySurface,
} from "@/features/authorization/dashboardRegistry";
import { OPS_NAV_GROUP_ID } from "@/components/layout/sidebarNavigation";

export type GeneratedNavItem = {
  type: "item";
  name: string;
  href: string;
  icon: string;
  /** Any of these capabilities grants visibility. */
  capabilities: KnownCapability[];
  group?: "ops" | "root";
  order: number;
};

export type GeneratedNavGroup = {
  type: "group";
  id: typeof OPS_NAV_GROUP_ID;
  name: string;
  icon: string;
  capabilities: KnownCapability[];
  children: GeneratedNavItem[];
  order: number;
};

export type GeneratedNavEntry = GeneratedNavItem | GeneratedNavGroup;

function surfaceToItem(surface: DashboardCapabilitySurface): GeneratedNavItem | null {
  if (!surface.navigation) return null;
  return {
    type: "item",
    name: surface.navigation.label,
    href: surface.navigation.href,
    icon: surface.navigation.icon,
    capabilities: [surface.capability],
    group: surface.navigation.kind,
    order: surface.navigation.order,
  };
}

/**
 * Build the canonical navigation tree from capability surfaces.
 * Ops children are nested under a single Ops group.
 */
export function generateNavigationFromCapabilities(): GeneratedNavEntry[] {
  const surfaces = getNavigationSurfaces();
  const rootItems: GeneratedNavItem[] = [];
  const opsItems: GeneratedNavItem[] = [];

  for (const surface of surfaces) {
    const item = surfaceToItem(surface);
    if (!item) continue;
    if (item.group === "ops") {
      opsItems.push(item);
    } else {
      rootItems.push(item);
    }
  }

  rootItems.sort((a, b) => a.order - b.order);
  opsItems.sort((a, b) => a.order - b.order);

  const entries: GeneratedNavEntry[] = [];

  // Insert Overview + Workboard first, then Ops group, then remaining root items
  const beforeOps = rootItems.filter((i) => i.order < 30);
  const afterOps = rootItems.filter((i) => i.order >= 30);

  entries.push(...beforeOps);

  if (opsItems.length > 0) {
    entries.push({
      type: "group",
      id: OPS_NAV_GROUP_ID,
      name: "Ops",
      icon: "SlidersHorizontal",
      capabilities: [...new Set(opsItems.flatMap((c) => c.capabilities))],
      children: opsItems,
      order: 25,
    });
  }

  entries.push(...afterOps);
  return entries;
}

export function filterGeneratedNavigation(
  navigation: GeneratedNavEntry[],
  granted: ReadonlySet<string> | readonly string[],
): GeneratedNavEntry[] {
  const set = granted instanceof Set ? granted : new Set(granted);

  return navigation
    .map((entry) => {
      if (entry.type === "group") {
        const children = entry.children.filter((child) =>
          child.capabilities.some((cap) => set.has(cap)),
        );
        if (children.length === 0) return null;
        return { ...entry, children };
      }
      if (entry.capabilities.some((cap) => set.has(cap))) return entry;
      return null;
    })
    .filter((entry): entry is GeneratedNavEntry => entry !== null);
}

export function canSeeNavHref(
  href: string,
  granted: ReadonlySet<string> | readonly string[],
): boolean {
  const filtered = filterGeneratedNavigation(
    generateNavigationFromCapabilities(),
    granted,
  );
  for (const entry of filtered) {
    if (entry.type === "group") {
      if (entry.children.some((c) => c.href === href)) return true;
    } else if (entry.href === href) {
      return true;
    }
  }
  return false;
}
