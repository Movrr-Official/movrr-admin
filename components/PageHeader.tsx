import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "./ui/button";

interface PageHeaderProps {
  title?: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    icon?: ReactNode;
    onClick?: () => void;
    asChild?: boolean;
  };
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
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

      {action && (
        <Button
          asChild={action.asChild || Boolean(action.href)}
          onClick={action.onClick}
          className="bg-primary hover:bg-primary/90 text-primary-foreground mt-4 md:mt-0"
        >
          {action.href ? (
            <Link href={action.href}>
              {action.icon && (
                <span className="mr-2 h-4 w-4">{action.icon}</span>
              )}
              {action.label}
            </Link>
          ) : (
            <>
              {action.icon && (
                <span className="mr-2 h-4 w-4">{action.icon}</span>
              )}
              {action.label}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
