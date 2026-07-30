"use client";

import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SEARCH_ENTITY_ICONS } from "@/lib/search/icons";
import type { SearchEntityIconKey } from "@/lib/search/types";
import { cn } from "@/lib/utils";

type SearchResultLeadingProps = {
  title: string;
  icon: SearchEntityIconKey;
  badgeClassName: string;
  avatarUrl?: string | null;
  /** Prefer avatar for person-like entities when a URL is present. */
  preferAvatar?: boolean;
};

export function SearchResultLeading({
  title,
  icon,
  badgeClassName,
  avatarUrl,
  preferAvatar = false,
}: SearchResultLeadingProps) {
  const Icon = SEARCH_ENTITY_ICONS[icon] ?? Search;
  const showAvatar = preferAvatar && Boolean(avatarUrl);
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (showAvatar) {
    return (
      <Avatar className="h-8 w-8 shrink-0 border border-border">
        <AvatarImage src={avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="text-[10px] font-medium">
          {initials || <Icon className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border shrink-0",
        badgeClassName,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

export function prefersPersonAvatar(
  type: string,
): boolean {
  return type === "user" || type === "rider";
}
