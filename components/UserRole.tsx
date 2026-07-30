import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { AdminRole } from "@/types/auth";
import { Badge } from "@/components/ui/badge";
import { getEmployeeRoleLabel } from "@/features/authorization/roleOptions";

type RoleBadgeStyle = {
  className: string;
};

const ROLE_BADGE_STYLES: Partial<Record<AdminRole, RoleBadgeStyle>> = {
  super_admin: {
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  security_admin: {
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  operations_manager: {
    className: "bg-primary/10 text-primary border-primary/20",
  },
  admin: {
    className: "bg-primary/10 text-primary border-primary/20",
  },
  platform_operator: {
    className: "bg-primary/10 text-primary border-primary/20",
  },
  engineering_operations: {
    className: "bg-primary/10 text-primary border-primary/20",
  },
  campaign_manager: {
    className: "bg-secondary text-secondary-foreground border-border",
  },
  partner_operations_manager: {
    className: "bg-secondary text-secondary-foreground border-border",
  },
  product_operations: {
    className: "bg-secondary text-secondary-foreground border-border",
  },
  moderator: {
    className: "bg-secondary text-secondary-foreground border-border",
  },
  fraud_analyst: {
    className: "bg-warning/10 text-warning-foreground border-warning/30",
  },
  trust_safety_analyst: {
    className: "bg-warning/10 text-warning-foreground border-warning/30",
  },
  support_agent: {
    className: "bg-success/10 text-success border-success/30",
  },
  support_lead: {
    className: "bg-success/10 text-success border-success/30",
  },
  support: {
    className: "bg-success/10 text-success border-success/30",
  },
  finance_operator: {
    className: "bg-info/10 text-info border-info/30",
  },
  compliance_analyst: {
    className:
      "bg-info/10 text-info border-info/30 dark:bg-primary/15 dark:text-primary dark:border-primary/35",
  },
  compliance_officer: {
    className:
      "bg-info/10 text-info border-info/30 dark:bg-primary/15 dark:text-primary dark:border-primary/35",
  },
  programme_operations_manager: {
    className:
      "bg-warning/10 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning dark:border-warning/40",
  },
  government: {
    className:
      "bg-warning/10 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning dark:border-warning/40",
  },
  executive_viewer: {
    className: "bg-muted text-muted-foreground border-border",
  },
};

const DEFAULT_BADGE_STYLE: RoleBadgeStyle = {
  className: "bg-muted text-muted-foreground border-border",
};

export const getRoleIcon = (role: AdminRole) => {
  switch (role) {
    case "super_admin":
    case "security_admin":
      return <ShieldAlert className="h-4 w-4 text-destructive" />;
    case "operations_manager":
    case "admin":
    case "platform_operator":
    case "engineering_operations":
      return <ShieldCheck className="h-4 w-4 text-primary" />;
    case "support_agent":
    case "support_lead":
    case "support":
    case "campaign_manager":
    case "partner_operations_manager":
    case "product_operations":
    case "moderator":
    case "programme_operations_manager":
    case "government":
    case "compliance_analyst":
    case "compliance_officer":
    case "fraud_analyst":
    case "trust_safety_analyst":
    case "finance_operator":
      return <Shield className="h-4 w-4 text-info" />;
    default:
      return <ShieldQuestion className="h-4 w-4 text-muted-foreground" />;
  }
};

export const getRoleBadge = (role: AdminRole) => {
  const style = ROLE_BADGE_STYLES[role] ?? DEFAULT_BADGE_STYLE;
  const displayName = getEmployeeRoleLabel(role).toUpperCase();

  return (
    <Badge
      variant="outline"
      className={`font-medium ${style.className}`}
    >
      {getRoleIcon(role)}
      <span className="ml-1">{displayName}</span>
    </Badge>
  );
};
