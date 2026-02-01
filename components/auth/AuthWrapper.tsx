import { createSupabaseServerClient } from "@/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "@/schemas";
import { normalizeAdminRole } from "@/lib/authPermissions";
import { logger } from "@/lib/logger";

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: readonly UserRole[];
}

export default async function AuthWrapper({
  children,
  allowedRoles,
}: AuthWrapperProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logger.warn("Supabase getUser failed in AuthWrapper", {
      message: userError.message,
    });
  }

  if (!user) {
    redirect("/auth/signin?redirectTo=/");
  }

  const { data: adminUser, error: adminUserError } = await supabase
    .from("admin_users")
    .select("role, email")
    .eq("user_id", user.id)
    .single();

  if (adminUserError) {
    logger.warn("Admin role lookup failed in AuthWrapper", {
      message: adminUserError.message,
      userId: user.id,
    });
  }

  const rawRole =
    typeof adminUser?.role === "string" ? adminUser.role : undefined;
  const adminRole = normalizeAdminRole(rawRole);

  if (!adminRole) {
    redirect("/unauthorized");
  }

  if (allowedRoles && !allowedRoles.includes(adminRole)) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
