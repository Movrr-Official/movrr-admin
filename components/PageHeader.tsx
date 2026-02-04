import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface PageHeaderProps {
  title?: string;
  description?: string;
  action?: {
    type?: "button" | "select";
    label: string;
    href?: string;
    icon?: ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    variant?: "default" | "secondary" | "outline" | "ghost" | "link";
    options?: Array<{ label: string; value: string }>;
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
  };
  actions?: Array<{
    type?: "button" | "select";
    label: string;
    href?: string;
    icon?: ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    variant?: "default" | "secondary" | "outline" | "ghost" | "link";
    options?: Array<{ label: string; value: string }>;
    value?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
  }>;
}

export function PageHeader({
  title,
  description,
  action,
  actions,
}: PageHeaderProps) {
  const resolvedActions = actions ?? (action ? [action] : []);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>

      {resolvedActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
          {resolvedActions.map((item) =>
            item.type === "select" ? (
              <Select
                key={item.label}
                value={item.value}
                onValueChange={item.onValueChange}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={item.placeholder ?? item.label} />
                </SelectTrigger>
                <SelectContent>
                  {(item.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                key={item.label}
                asChild={item.asChild || Boolean(item.href)}
                onClick={item.onClick}
                variant={item.variant ?? "default"}
                className={
                  item.variant
                    ? undefined
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }
              >
                {item.href ? (
                  <Link href={item.href}>
                    {item.icon && (
                      <span className="mr-2 h-4 w-4">{item.icon}</span>
                    )}
                    {item.label}
                  </Link>
                ) : (
                  <>
                    {item.icon && (
                      <span className="mr-2 h-4 w-4">{item.icon}</span>
                    )}
                    {item.label}
                  </>
                )}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
