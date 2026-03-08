import { redirect } from "next/navigation";
import type { UserRole } from "@/schemas";
import { requireAdminRoles } from "@/lib/admin";
import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: readonly UserRole[];
}

export default async function AuthWrapper({
  children,
  allowedRoles,
}: AuthWrapperProps) {
  try {
    await requireAdminRoles(allowedRoles ?? DASHBOARD_ACCESS_ROLES);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("authentication required")
    ) {
      redirect("/auth/signin?redirectTo=/");
    }
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
