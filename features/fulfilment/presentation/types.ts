import type { LucideIcon } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

/** Extensible presentation metadata for a domain enum value. */
export type FulfilmentPresentation = {
  /** User-facing label. */
  label: string;
  /** Optional short helper copy for tooltips / empty states. */
  description?: string;
  /** Badge colour token from the shared Badge component. */
  badgeVariant: BadgeVariant;
  /** Optional Lucide icon for future ops surfaces. */
  icon?: LucideIcon;
};

/** Fallback when a new domain value is not yet catalogued. */
export function humanizeEnumToken(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
