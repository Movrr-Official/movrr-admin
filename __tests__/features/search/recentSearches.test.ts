import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
} from "@/lib/search/recentSearches";

describe("recentSearches", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores navigated entities newest-first and dedupes by type+id", () => {
    pushRecentSearch({
      id: "1",
      type: "user",
      title: "Ada",
      href: "/users?id=1",
      label: "User",
      icon: "user",
      badgeClassName: "x",
    });
    pushRecentSearch({
      id: "2",
      type: "campaign",
      title: "Spring",
      href: "/campaigns?id=2",
      label: "Campaign",
      icon: "megaphone",
      badgeClassName: "y",
    });
    pushRecentSearch({
      id: "1",
      type: "user",
      title: "Ada Lovelace",
      href: "/users?id=1",
      label: "User",
      icon: "user",
      badgeClassName: "x",
    });

    const recent = getRecentSearches();
    expect(recent).toHaveLength(2);
    expect(recent[0]?.title).toBe("Ada Lovelace");
    expect(recent[1]?.type).toBe("campaign");
  });

  it("stores optional avatarUrl for person results", () => {
    pushRecentSearch({
      id: "1",
      type: "user",
      title: "Ada",
      href: "/users?id=1",
      label: "User",
      icon: "user",
      badgeClassName: "x",
      avatarUrl: "https://example.com/a.png",
    });
    expect(getRecentSearches()[0]?.avatarUrl).toBe("https://example.com/a.png");
  });

  it("clears stored recents", () => {
    pushRecentSearch({
      id: "1",
      type: "user",
      title: "Ada",
      href: "/users?id=1",
      label: "User",
      icon: "user",
      badgeClassName: "x",
    });
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });
});
