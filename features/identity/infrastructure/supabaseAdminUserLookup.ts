import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FindAdminUser } from "@/features/identity/application/contracts/AuthenticateRequest";

/**
 * Real adapter for Identity's findAdminUser port.
 * Reads admin_users by auth user_id.
 */
export const findAdminUser: FindAdminUser = async (userId: string) => {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, user_id, email, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    userId: (data.user_id as string) ?? userId,
    email: (data.email as string | null) ?? null,
    role: data.role as string,
  };
};
