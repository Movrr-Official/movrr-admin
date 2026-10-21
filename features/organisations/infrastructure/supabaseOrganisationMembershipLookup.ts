import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { FindOrganisationMembership } from "@/features/identity/application/contracts/AuthenticateRequest";

/**
 * Real adapter for Identity's findOrganisationMembership port.
 * Reads active organisation_membership rows (Task 3 schema).
 */
export const findOrganisationMembership: FindOrganisationMembership = async (
  userId: string,
  organisationId?: string,
) => {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("organisation_membership")
    .select("id, organisation_id, user_id, role, status, organisation:organisation_id!inner (type, status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("organisation.status", "active");
  if (organisationId) query = query.eq("organisation_id", organisationId);
  // Multiple memberships require explicit tenant selection; never choose by age.
  const { data: rows, error } = await query.limit(2);
  const data = rows?.length === 1 ? rows[0] : null;

  if (error || !data) {
    return null;
  }

  const orgRow = data.organisation as { type?: string } | { type?: string }[] | null;
  const orgType = Array.isArray(orgRow) ? orgRow[0]?.type : orgRow?.type;

  return {
    id: data.id as string,
    organisationId: data.organisation_id as string,
    userId: data.user_id as string,
    role: data.role as string | undefined,
    organisationType: orgType as
      | "reward_partner"
      | "advertiser"
      | "government"
      | "movrr"
      | undefined,
  };
};
