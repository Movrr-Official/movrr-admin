import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { AdminRole } from "@/types/auth";
import { Badge } from "@/components/ui/badge";

export const getRoleIcon = (role: AdminRole) => {
  switch (role) {
    case "super_admin":
      return <ShieldAlert className="h-4 w-4 text-destructive" />;
    case "admin":
      return <ShieldCheck className="h-4 w-4 text-primary" />;
    case "moderator":
    case "support":
    case "government":
      return <Shield className="h-4 w-4 text-info" />;
    default:
      return <ShieldQuestion className="h-4 w-4 text-muted-foreground" />;
  }
};

export const getRoleBadge = (role: AdminRole) => {
  const baseClasses = "font-medium";

  const variantConfig = {
    super_admin: {
      className: "bg-destructive/10 text-destructive border-destructive/30",
      displayName: "SUPER ADMIN",
    },
    admin: {
      className: "bg-primary/10 text-primary border-primary/20",
      displayName: "ADMIN",
    },
    moderator: {
      className: "bg-accent-alt/10 text-accent-alt border-accent-alt/30",
      displayName: "MODERATOR",
    },
    support: {
      className: "bg-success/10 text-success border-success/30",
      displayName: "SUPPORT",
    },
    compliance_officer: {
      className: "bg-info/10 text-info border-info/30",
      displayName: "COMPLIANCE OFFICER",
    },
    government: {
      className: "bg-warning/10 text-warning border-warning/30",
      displayName: "GOVERNMENT",
    },
  };

  const config = variantConfig[role] || {
    className: "bg-muted text-muted-foreground border-border",
    displayName: role,
  };

  return (
    <Badge variant="outline" className={`${baseClasses} ${config.className}`}>
      {getRoleIcon(role)}
      <span className="ml-1">{config.displayName}</span>
    </Badge>
  );
};
