"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type ModuleSubNavItem = {
  label: string;
  href: string;
};

type ModuleSubNavProps = {
  items: readonly ModuleSubNavItem[];
  ariaLabel: string;
};

export function ModuleSubNav({ items, ariaLabel }: ModuleSubNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={ariaLabel}
      className="mb-6 -mx-1 overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max items-center gap-1 px-1 pb-px">
        {items.map((item) => {
          const isActive =
            item.href === pathname ||
            (item.href !== items[0]?.href &&
              pathname.startsWith(`${item.href}/`));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
