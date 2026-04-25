"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { writeUserActivity } from "@/lib/userActivity";
import { RiderBadge } from "@/schemas";

/**
 * Fetch all badge awards for a rider.
 *
 * rider_badge_award joins to rider_badge_definition via badge_definition_id
 * (UUID FK). There is no badge_code column on rider_badge_award — the
 * earlier code that tried to join via badge_code was querying a column that
 * does not exist, causing a PostgREST 42703 error and a silent empty state.
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
        "id, rider_id, badge_definition_id, source, metadata, awarded_at, revoked_at, badge_definition:badge_definition_id(id, code, short_label, description, hero_variant, category, tint, icon, icon_family)",
      )
      .eq("rider_id", riderId)
      .order("awarded_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as Array<{
      id: string;
      rider_id: string;
      badge_definition_id: string;
      source?: string | null;
      metadata?: Record<string, unknown> | null;
      awarded_at: string;
      revoked_at?: string | null;
      badge_definition?: {
        id?: string | null;
        code?: string | null;
        short_label?: string | null;
        description?: string | null;
        hero_variant?: string | null;
        category?: string | null;
        tint?: string | null;
        icon?: string | null;
        icon_family?: string | null;
      } | null;
    }>;

    const badges: RiderBadge[] = rows.map((row) => {
      const def = Array.isArray(row.badge_definition)
        ? row.badge_definition[0]
        : row.badge_definition;

      const tint = def?.tint;
      const category = def?.category;
      const meta = (row.metadata ?? {}) as Record<string, unknown>;

      return {
        id: row.id,
        riderId: row.rider_id,
        badgeDefinitionId: row.badge_definition_id,
        badgeCode: def?.code ?? row.badge_definition_id,
        badgeLabel: def?.short_label ?? def?.code ?? "Badge",
        badgeDescription: def?.description ?? undefined,
        tint:
          tint === "warm" || tint === "brand" || tint === "strong" || tint === "neutral"
            ? tint
            : "neutral",
        category:
          category === "milestone" ||
          category === "trophy" ||
          category === "engagement" ||
          category === "hero"
            ? category
            : "milestone",
        icon: def?.icon ?? undefined,
        iconFamily: def?.icon_family ?? undefined,
        awardedAt: row.awarded_at,
        revokedAt: row.revoked_at ?? undefined,
        isActive: !row.revoked_at,
        source: row.source ?? "system_rule",
        revokeReason:
          typeof meta.revokeReason === "string" ? meta.revokeReason : undefined,
        metadata: meta,
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
 * Sets revoked_at and stores the admin ID and optional reason in metadata.
 * rider_badge_award has no is_active, revoked_by, or revoke_reason columns —
 * revocation state is tracked solely via revoked_at (NULL = active).
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
      .select("id, rider_id, badge_definition_id, metadata")
      .eq("id", badgeAwardId)
      .single();

    if (fetchError || !awardRow) {
      return { success: false, error: fetchError?.message ?? "Badge award not found" };
    }

    const existingMeta = (awardRow.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = {
      ...existingMeta,
      revokedByAdminId: auth.authUser.id,
      revokeReason: reason ?? null,
    };

    const { error } = await supabase
      .from("rider_badge_award")
      .update({
        revoked_at: new Date().toISOString(),
        metadata: updatedMeta,
      })
      .eq("id", badgeAwardId);

    if (error) return { success: false, error: error.message };

    // Fetch badge code for activity log description
    const { data: defRow } = await supabase
      .from("rider_badge_definition")
      .select("code, short_label")
      .eq("id", awardRow.badge_definition_id)
      .maybeSingle();

    const badgeLabel = defRow?.short_label ?? defRow?.code ?? awardRow.badge_definition_id;

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
        description: `Badge "${badgeLabel}" revoked by admin.${reason ? ` Reason: ${reason}` : ""}`,
        related_entity_type: "rider",
        related_entity_id: awardRow.rider_id,
        metadata: {
          badgeAwardId,
          badgeDefinitionId: awardRow.badge_definition_id,
          reason: reason ?? null,
        },
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
 * Looks up the definition by code first to obtain badge_definition_id,
 * which is the only FK on rider_badge_award — there is no badge_code column.
 * Source must be 'admin_manual' per the rider_badge_award source constraint.
 */
export async function awardRiderBadge(
  riderId: string,
  badgeCode: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data: defRow, error: defError } = await supabase
      .from("rider_badge_definition")
      .select("id, code, short_label")
      .eq("code", badgeCode)
      .eq("is_active", true)
      .maybeSingle();

    if (defError || !defRow) {
      return {
        success: false,
        error: defError?.message ?? `Badge definition not found for code: ${badgeCode}`,
      };
    }

    const { error } = await supabase.from("rider_badge_award").insert({
      rider_id: riderId,
      badge_definition_id: defRow.id,
      awarded_at: new Date().toISOString(),
      source: "admin_manual",
      metadata: { awardedByAdminId: auth.authUser.id },
    });

    if (error) {
      // UNIQUE(rider_id, badge_definition_id) — rider already has this badge
      if (error.code === "23505") {
        return { success: false, error: "This rider already has that badge." };
      }
      return { success: false, error: error.message };
    }

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
        description: `Badge "${defRow.short_label ?? badgeCode}" manually awarded by admin.`,
        related_entity_type: "rider",
        related_entity_id: riderId,
        metadata: { badgeCode, badgeDefinitionId: defRow.id, source: "admin_manual" },
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
 * Fetch all active badge definitions for the admin award dropdown.
 * Columns: short_label (not label), category (not tier). No emoji column exists.
 */
export async function getBadgeDefinitions(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    code: string;
    label: string;
    description?: string;
    category: string;
    tint: string;
    icon?: string;
    iconFamily?: string;
  }>;
  error?: string;
}> {
  try {
    await requireAdminRoles(ADMIN_ONLY_ROLES);
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("rider_badge_definition")
      .select("id, code, short_label, description, category, tint, icon, icon_family")
      .eq("is_active", true)
      .order("category")
      .order("sort_order");

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id as string,
        code: row.code as string,
        label: (row.short_label ?? row.code) as string,
        description: (row.description ?? undefined) as string | undefined,
        category: (row.category ?? "milestone") as string,
        tint: (row.tint ?? "neutral") as string,
        icon: (row.icon ?? undefined) as string | undefined,
        iconFamily: (row.icon_family ?? undefined) as string | undefined,
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
