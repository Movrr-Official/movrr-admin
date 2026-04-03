import { redirect } from "next/navigation";
import type { UserRole } from "@/schemas";
import {
  isAdminAuthError,
  requireAdminRoles,
  trackAdminDashboardSession,
} from "@/lib/admin";
import { DASHBOARD_ACCESS_ROLES } from "@/lib/authPermissions";

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: readonly UserRole[];
}

export default async function AuthWrapper({
  children,
  allowedRoles,
}: AuthWrapperProps) {
  let authenticatedUser;

  try {
    authenticatedUser = await requireAdminRoles(
      allowedRoles ?? DASHBOARD_ACCESS_ROLES,
    );
    await trackAdminDashboardSession(authenticatedUser);
  } catch (error) {
    if (isAdminAuthError(error)) {
      if (
        error.code === "UNAUTHENTICATED" ||
        error.code === "SESSION_EXPIRED" ||
        error.code === "SESSION_BOOTSTRAP_REQUIRED" ||
        error.code === "MFA_REQUIRED" ||
        error.code === "SESSION_BOOTSTRAP_FAILED" ||
        error.code === "AUTH_INTERNAL_ERROR"
      ) {
        const reason =
          error.code === "SESSION_EXPIRED" ||
          error.code === "SESSION_BOOTSTRAP_REQUIRED"
            ? "session_expired"
            : error.code === "MFA_REQUIRED"
              ? "mfa_required"
              : error.code === "SESSION_BOOTSTRAP_FAILED"
                ? "session_unavailable"
                : error.code === "AUTH_INTERNAL_ERROR"
                  ? "auth_unavailable"
                  : "auth_required";

        redirect(`/auth/signin?redirectTo=/&reason=${reason}`);
      }

      redirect("/unauthorized");
    }

    redirect("/unauthorized");
  }

  return <>{children}</>;
}
