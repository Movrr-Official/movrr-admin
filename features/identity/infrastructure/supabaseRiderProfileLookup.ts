import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FindRiderProfile } from "@/features/identity/application/contracts/AuthenticateRequest";

/**
 * Real adapter for Identity's findRiderProfile port.
 * Reads rider profile by auth user_id.
 */
export const findRiderProfile: FindRiderProfile = async (userId: string) => {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("rider")
    .select("id, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    userId: (data.user_id as string) ?? userId,
  };
};
