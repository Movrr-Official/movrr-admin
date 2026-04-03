"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { writeUserActivity } from "@/lib/userActivity";
import { RiderBadge } from "@/schemas";

/**
 * Fetch all badge awards for a rider.
 * Joins rider_badge_award with rider_badge_definition.
 */
export async function getRiderBadges(
  riderId: string,
): Promise<{ success: boolean; data?: RiderBadge[]; error?: string }> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("rider_badge_award")
      .select(
        "id, rider_id, awarded_at, revoked_at, is_active, source, revoked_by, revoke_reason, badge_definition:badge_code(code, label, description, emoji, variant, tier)",
      )
      .eq("rider_id", riderId)
      .order("awarded_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as Array<{
      id: string;
      rider_id: string;
      awarded_at: string;
      revoked_at?: string | null;
      is_active?: boolean | null;
      source?: string | null;
      revoked_by?: string | null;
      revoke_reason?: string | null;
      badge_definition?: {
        code?: string | null;
        label?: string | null;
        description?: string | null;
        emoji?: string | null;
        variant?: string | null;
        tier?: string | null;
      } | null;
    }>;

    const badges: RiderBadge[] = rows.map((row) => {
      const def = Array.isArray(row.badge_definition)
        ? row.badge_definition[0]
        : row.badge_definition;

      const variant = def?.variant;
      const tier = def?.tier;

      return {
        id: row.id,
        riderId: row.rider_id,
        badgeCode: def?.code ?? row.id,
        badgeLabel: def?.label ?? def?.code ?? "Badge",
        badgeDescription: def?.description ?? undefined,
        badgeEmoji: def?.emoji ?? undefined,
        variant: (variant === "warm" || variant === "strong" || variant === "neutral") ? variant : "neutral",
        tier: (tier === "hero" || tier === "engagement") ? tier : "engagement",
        awardedAt: row.awarded_at,
        revokedAt: row.revoked_at ?? undefined,
        isActive: Boolean(row.is_active ?? true),
        source: row.source ?? "system",
        revokedBy: row.revoked_by ?? undefined,
        revokeReason: row.revoke_reason ?? undefined,
      };
    });

    return { success: true, data: badges };
  } catch (error) {
    console.error("getRiderBadges error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch badges",
    };
  }
}

/**
 * Revoke a badge award.
 * Soft-deletes by setting is_active = false and recording who revoked it.
 */
export async function revokeRiderBadge(
  badgeAwardId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data: awardRow, error: fetchError } = await supabase
      .from("rider_badge_award")
      .select("id, rider_id, badge_code")
      .eq("id", badgeAwardId)
      .single();

    if (fetchError || !awardRow) {
      return { success: false, error: fetchError?.message ?? "Badge award not found" };
    }

    const { error } = await supabase
      .from("rider_badge_award")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: auth.authUser.id,
        revoke_reason: reason ?? null,
      })
      .eq("id", badgeAwardId);

    if (error) return { success: false, error: error.message };

    // Fetch rider's user_id for activity log
    const { data: riderRow } = await supabase
      .from("rider")
      .select("user_id")
      .eq("id", awardRow.rider_id)
      .maybeSingle();

    if (riderRow?.user_id) {
      await writeUserActivity(supabase, {
        user_id: riderRow.user_id,
        actor_user_id: auth.authUser.id,
        source: "account",
        action: "Badge revoked",
        description: `Badge "${awardRow.badge_code}" revoked by admin.${reason ? ` Reason: ${reason}` : ""}`,
        related_entity_type: "rider",
        related_entity_id: awardRow.rider_id,
        metadata: { badgeAwardId, badgeCode: awardRow.badge_code, reason: reason ?? null },
      }).catch((err) => console.warn("Badge revoke activity write failed:", err));
    }

    revalidatePath("/riders");
    return { success: true };
  } catch (error) {
    console.error("revokeRiderBadge error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke badge",
    };
  }
}

/**
 * Manually award a badge to a rider.
 */
export async function awardRiderBadge(
  riderId: string,
  badgeCode: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("rider_badge_award").insert({
      rider_id: riderId,
      badge_code: badgeCode,
      awarded_at: new Date().toISOString(),
      is_active: true,
      source: "admin",
    });

    if (error) return { success: false, error: error.message };

    const { data: riderRow } = await supabase
      .from("rider")
      .select("user_id")
      .eq("id", riderId)
      .maybeSingle();

    if (riderRow?.user_id) {
      await writeUserActivity(supabase, {
        user_id: riderRow.user_id,
        actor_user_id: auth.authUser.id,
        source: "account",
        action: "Badge awarded",
        description: `Badge "${badgeCode}" manually awarded by admin.`,
        related_entity_type: "rider",
        related_entity_id: riderId,
        metadata: { badgeCode, source: "admin" },
      }).catch((err) => console.warn("Badge award activity write failed:", err));
    }

    revalidatePath("/riders");
    return { success: true };
  } catch (error) {
    console.error("awardRiderBadge error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to award badge",
    };
  }
}

/**
 * Fetch all available badge definitions for the admin to award.
 */
export async function getBadgeDefinitions(): Promise<{
  success: boolean;
  data?: Array<{ code: string; label: string; description?: string; emoji?: string; tier: string }>;
  error?: string;
}> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("rider_badge_definition")
      .select("code, label, description, emoji, tier")
      .order("tier")
      .order("label");

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        code: row.code,
        label: row.label ?? row.code,
        description: row.description ?? undefined,
        emoji: row.emoji ?? undefined,
        tier: row.tier ?? "engagement",
      })),
    };
  } catch (error) {
    console.error("getBadgeDefinitions error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch badge definitions",
    };
  }
}
