import type { SearchEntityIconKey, SearchableEntityType } from "@/lib/search/types";

const STORAGE_KEY = "movrr-admin.global-search.recent";
const MAX_RECENT = 8;

export type RecentSearchItem = {
  id: string;
  type: SearchableEntityType;
  title: string;
  subtitle?: string;
  href: string;
  label: string;
  icon: SearchEntityIconKey;
  badgeClassName: string;
  avatarUrl?: string;
  visitedAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRaw(): RecentSearchItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentSearchItem).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function isRecentSearchItem(value: unknown): value is RecentSearchItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.type === "string" &&
    typeof item.title === "string" &&
    typeof item.href === "string" &&
    typeof item.label === "string" &&
    typeof item.icon === "string" &&
    typeof item.badgeClassName === "string" &&
    typeof item.visitedAt === "number" &&
    (item.avatarUrl === undefined || typeof item.avatarUrl === "string")
  );
}

export function getRecentSearches(): RecentSearchItem[] {
  return readRaw();
}

export function pushRecentSearch(
  item: Omit<RecentSearchItem, "visitedAt"> & { visitedAt?: number },
): RecentSearchItem[] {
  const nextItem: RecentSearchItem = {
    ...item,
    visitedAt: item.visitedAt ?? Date.now(),
  };
  const existing = readRaw().filter(
    (entry) => !(entry.type === nextItem.type && entry.id === nextItem.id),
  );
  const next = [nextItem, ...existing].slice(0, MAX_RECENT);
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota / private-mode failures — search still works without recents.
    }
  }
  return next;
}

export function clearRecentSearches(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
