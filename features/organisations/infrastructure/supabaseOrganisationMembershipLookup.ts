import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FindOrganisationMembership } from "@/features/identity/application/contracts/AuthenticateRequest";

/**
 * Real adapter for Identity's findOrganisationMembership port.
 * Reads active organisation_membership rows (Task 3 schema).
 */
export const findOrganisationMembership: FindOrganisationMembership = async (
  userId: string,
) => {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("organisation_membership")
    .select("id, organisation_id, user_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    organisationId: data.organisation_id as string,
    userId: data.user_id as string,
    role: data.role as string | undefined,
  };
};
