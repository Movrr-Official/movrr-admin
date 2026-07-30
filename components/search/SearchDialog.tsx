"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpRight, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { globalSearch, type SearchResult } from "@/app/actions/search";
import {
  getSearchableEntity,
  listSearchableEntityDefinitions,
} from "@/lib/search/registry";
import { canAccessSearchableEntity } from "@/lib/search/access";
import { highlightMatch } from "@/lib/search/highlight";
import {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
  type RecentSearchItem,
} from "@/lib/search/recentSearches";
import type { SearchableEntityType } from "@/lib/search/types";
import { useAdminUser } from "@/hooks/useAdminUser";
import { cn } from "@/lib/utils";
import {
  SearchResultLeading,
  prefersPersonAvatar,
} from "./SearchResultLeading";
import { SearchDialogFooter } from "./SearchDialogFooter";

interface SearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function groupResultsByType(results: SearchResult[]) {
  const groups = new Map<string, SearchResult[]>();
  for (const result of results) {
    const key = result.label;
    const list = groups.get(key) ?? [];
    list.push(result);
    groups.set(key, list);
  }
  return Array.from(groups.entries());
}

function canAccessEntityType(
  type: SearchableEntityType,
  role: string | null | undefined,
): boolean {
  try {
    return canAccessSearchableEntity(getSearchableEntity(type), role);
  } catch {
    return false;
  }
}

export function SearchDialog({ isOpen, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recents, setRecents] = useState<RecentSearchItem[]>([]);
  const router = useRouter();
  const { data: adminUser } = useAdminUser();
  const role = adminUser?.role;

  const browseEntities = useMemo(
    () =>
      listSearchableEntityDefinitions().filter((entity) =>
        canAccessSearchableEntity(entity, role),
      ),
    [role],
  );

  const visibleRecents = useMemo(
    () => recents.filter((item) => canAccessEntityType(item.type, role)),
    [recents, role],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setQuery("");
    setResults([]);
  }, [onOpenChange]);

  const goTo = useCallback(
    (href: string) => {
      if (!href) return;
      router.push(href);
      handleClose();
    },
    [router, handleClose],
  );

  const navigateToResult = useCallback(
    (item: {
      id: string;
      type: SearchResult["type"];
      title: string;
      subtitle?: string;
      href: string;
      label: string;
      icon: SearchResult["icon"];
      badgeClassName: string;
      avatarUrl?: string;
    }) => {
      if (!item.href) return;
      if (!canAccessEntityType(item.type, role)) return;
      pushRecentSearch({
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        href: item.href,
        label: item.label,
        icon: item.icon,
        badgeClassName: item.badgeClassName,
        avatarUrl: item.avatarUrl,
      });
      goTo(item.href);
    },
    [goTo, role],
  );

  useEffect(() => {
    if (!isOpen) return;
    setRecents(getRecentSearches());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const searchTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchResults = await globalSearch(query);
        if (cancelled) return;
        setResults(searchResults);
      } catch (error) {
        console.error("Search failed:", error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(searchTimer);
    };
  }, [query, isOpen]);

  const groupedResults = useMemo(
    () => groupResultsByType(results),
    [results],
  );

  const trimmedQuery = query.trim();
  const isIdle = trimmedQuery.length === 0;
  const isShortQuery = trimmedQuery.length === 1;
  const showRecents = isIdle && visibleRecents.length > 0;
  const showBrowse = isIdle && browseEntities.length > 0;
  const showKeepTyping = isShortQuery && !isLoading;
  const showNoResults =
    trimmedQuery.length >= 2 && !isLoading && results.length === 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden border-border shadow-lg flex flex-col max-h-[min(72vh,640px)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search Admin records or jump to a module.
          </DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter={false}
          className="flex flex-col overflow-hidden rounded-none bg-transparent"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search by name, email, or title…"
            className="h-12"
          />

          <CommandList className="max-h-[min(52vh,480px)] overflow-y-auto px-1 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm">Searching…</p>
              </div>
            ) : null}

            {showKeepTyping ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Keep typing — enter at least 2 characters
                </p>
              </div>
            ) : null}

            {showRecents ? (
              <CommandGroup
                heading={
                  <div className="flex w-full items-center justify-between">
                    <span>Recent</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        clearRecentSearches();
                        setRecents([]);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                }
              >
                {visibleRecents.map((item) => (
                  <CommandItem
                    key={`recent-${item.type}-${item.id}`}
                    value={`recent-${item.type}-${item.id}-${item.title}`}
                    onSelect={() => navigateToResult(item)}
                    className="gap-3 py-2.5"
                  >
                    <SearchResultLeading
                      title={item.title}
                      icon={item.icon}
                      badgeClassName={item.badgeClassName}
                      avatarUrl={item.avatarUrl}
                      preferAvatar={prefersPersonAvatar(item.type)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {item.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-5",
                            item.badgeClassName,
                          )}
                        >
                          {item.label}
                        </Badge>
                      </div>
                      {item.subtitle ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.subtitle}
                        </p>
                      ) : null}
                    </div>
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {showBrowse ? (
              <CommandGroup heading="Jump to">
                {browseEntities.map((entity) => (
                  <CommandItem
                    key={`browse-${entity.type}`}
                    value={`browse-${entity.type}-${entity.label}`}
                    onSelect={() => goTo(entity.navigation.listHref)}
                    className="gap-3 py-2.5"
                  >
                    <SearchResultLeading
                      title={entity.label}
                      icon={entity.icon}
                      badgeClassName={entity.badgeClassName}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{entity.label}</span>
                      <p className="text-xs text-muted-foreground">
                        Open {entity.pluralLabel}
                      </p>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {!isLoading &&
              groupedResults.map(([label, items]) => (
                <CommandGroup key={label} heading={label}>
                  {items.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}-${result.title}`}
                      onSelect={() => navigateToResult(result)}
                      className="gap-3 py-2.5"
                    >
                      <SearchResultLeading
                        title={result.title}
                        icon={result.icon}
                        badgeClassName={result.badgeClassName}
                        avatarUrl={result.avatarUrl}
                        preferAvatar={prefersPersonAvatar(result.type)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {highlightMatch(result.title, query)}
                          </span>
                          {result.status ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-5 capitalize"
                            >
                              {result.status.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                        </div>
                        {result.subtitle ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {highlightMatch(result.subtitle, query)}
                          </p>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

            {showNoResults ? (
              <CommandEmpty className="py-10">
                <div className="flex flex-col items-center text-center px-6 gap-1">
                  <p className="text-sm font-medium text-foreground">
                    No matches for &quot;{trimmedQuery}&quot;
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try another name, email, or title
                  </p>
                </div>
              </CommandEmpty>
            ) : null}
          </CommandList>
        </Command>

        <SearchDialogFooter />
      </DialogContent>
    </Dialog>
  );
}
