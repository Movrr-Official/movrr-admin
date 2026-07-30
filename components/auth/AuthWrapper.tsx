import { redirect } from "next/navigation";
import {
  isAdminAuthError,
  requireAnyCapability,
  requirePageAccess,
  resolveAdminAuthRedirectTarget,
} from "@/lib/admin";
import type { KnownCapability } from "@/features/organisations/domain/CapabilityCatalog";

interface AuthWrapperProps {
  children: React.ReactNode;
  /**
   * @deprecated Prefer `capability` / `capabilities` / `pathname`.
   * Retained only for transitional call sites — resolves to dashboard.read.
   */
  allowedRoles?: readonly string[];
  /** Single required capability (preferred). */
  capability?: KnownCapability | string;
  /** Allow if any listed capability is granted. */
  capabilities?: readonly (KnownCapability | string)[];
  /** Resolve required capabilities from the dashboard registry by path. */
  pathname?: string;
}

export default async function AuthWrapper({
  children,
  allowedRoles: _allowedRoles,
  capability,
  capabilities,
  pathname,
}: AuthWrapperProps) {
  try {
    if (pathname) {
      await requirePageAccess(pathname);
    } else if (capability) {
      await requireAnyCapability([capability]);
    } else if (capabilities && capabilities.length > 0) {
      await requireAnyCapability(capabilities);
    } else {
      // Capability-first baseline — never authorize by role name.
      await requireAnyCapability(["dashboard.read"]);
    }
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
        const redirectTarget = await resolveAdminAuthRedirectTarget();

        if (error.code === "MFA_REQUIRED") {
          redirect(
            `/auth/mfa/challenge?redirectTo=${encodeURIComponent(redirectTarget)}`,
          );
        }

        redirect(
          `/auth/signin?redirectTo=${encodeURIComponent(redirectTarget)}&reason=${reason}`,
        );
      }

      redirect("/unauthorized");
    }

    redirect("/unauthorized");
  }

  return <>{children}</>;
}
