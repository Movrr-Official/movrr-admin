import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow,filter,background-image] overflow-hidden shadow-sm backdrop-blur-[1px]",
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-gradient-to-tl from-primary via-primary to-primary/80 text-primary-foreground shadow-primary/20 [a&]:hover:from-primary/95 [a&]:hover:to-primary/75",
        secondary:
          "border-secondary/20 bg-gradient-to-tl from-secondary via-secondary to-secondary/85 text-secondary-foreground shadow-black/10 [a&]:hover:from-secondary/95 [a&]:hover:to-secondary/80",
        success:
          "border-success/25 bg-gradient-to-tl from-success via-success to-success/80 text-success-foreground shadow-success/20 [a&]:hover:from-success/95 [a&]:hover:to-success/75",
        info: "border-info/25 bg-gradient-to-tl from-info via-info to-info/80 text-info-foreground shadow-info/20 [a&]:hover:from-info/95 [a&]:hover:to-info/75",
        warning:
          "border-warning/30 bg-gradient-to-tl from-warning via-warning to-warning/80 text-warning-foreground shadow-warning/20 [a&]:hover:from-warning/95 [a&]:hover:to-warning/75",
        mock: "border-slate-500/25 bg-gradient-to-tl from-slate-700 via-slate-600 to-slate-500 text-white shadow-slate-900/20 [a&]:hover:from-slate-700 [a&]:hover:to-slate-500 dark:border-slate-400/25 dark:from-slate-500 dark:via-slate-400 dark:to-slate-300 dark:text-slate-950",
        accent:
          "border-accent-alt/25 bg-gradient-to-tl from-accent-alt via-accent-alt to-accent-alt/80 text-accent-alt-foreground shadow-accent-alt/20 [a&]:hover:from-accent-alt/95 [a&]:hover:to-accent-alt/75",
        destructive:
          "border-destructive/25 bg-gradient-to-tl from-destructive via-destructive to-destructive/80 text-destructive-foreground shadow-destructive/20 [a&]:hover:from-destructive/95 [a&]:hover:to-destructive/75 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "border-0 bg-transparent shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
