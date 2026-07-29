import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>;

/** Extensible presentation metadata for a domain enum value. */
export type OrganisationPresentation = {
  label: string;
  description?: string;
  badgeVariant: BadgeVariant;
};

/** Fallback when a new domain value is not yet catalogued. */
export function humanizeEnumToken(value: string): string {
  return value
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
