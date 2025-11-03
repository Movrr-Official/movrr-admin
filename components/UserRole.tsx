import { Shield, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { AdminRole } from "@/types/auth";
import { Badge } from "@/components/ui/badge";

export const getRoleIcon = (role: AdminRole) => {
  switch (role) {
    case "super_admin":
      return <ShieldAlert className="h-4 w-4 text-red-600" />;
    case "admin":
      return <ShieldCheck className="h-4 w-4 text-primary" />;
    case "moderator":
    case "support":
      return <Shield className="h-4 w-4 text-blue-600" />;
    default:
      return <ShieldQuestion className="h-4 w-4 text-muted-foreground" />;
  }
};

export const getRoleBadge = (role: AdminRole) => {
  const baseClasses = "font-medium";

  const variantConfig = {
    super_admin: {
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
      displayName: "SUPER ADMIN",
    },
    admin: {
      className: "bg-primary/10 text-primary border-primary/20",
      displayName: "ADMIN",
    },
    moderator: {
      className:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
      displayName: "MODERATOR",
    },
    support: {
      className:
        "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
      displayName: "SUPPORT",
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
