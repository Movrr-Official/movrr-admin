"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ONLY_ROLES } from "@/lib/authPermissions";
import { requireAdminRoles } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { mockProTips } from "@/data/mockProTips";
import {
  ProTip,
  ProTipFiltersSchema,
  CreateProTipFormData,
  UpdateProTipFormData,
} from "@/schemas";

function mapTipRow(row: Record<string, unknown>): ProTip {
  return {
    id: String(row.id ?? ""),
    icon: String(row.icon ?? ""),
    text: String(row.text ?? ""),
    category: row.category as ProTip["category"],
    priority: Number(row.priority ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getProTips(
  filters?: ProTipFiltersSchema,
): Promise<{ success: boolean; data?: ProTip[]; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    let tips = [...mockProTips];
    if (filters?.isActive !== undefined) {
      tips = tips.filter((t) => t.isActive === filters.isActive);
    }
    if (filters?.category && filters.category !== "all") {
      tips = tips.filter((t) => t.category === filters.category);
    }
    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      tips = tips.filter((t) => t.text.toLowerCase().includes(q));
    }
    return { success: true, data: tips };
  }

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("pro_tips")
      .select("id, icon, text, category, priority, is_active, created_at, updated_at")
      .order("priority", { ascending: true });

    if (filters?.isActive !== undefined) {
      query = query.eq("is_active", filters.isActive);
    }
    if (filters?.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }

    const { data, error } = await query;
    if (error) throw error;

    let tips = (data ?? []).map((row) =>
      mapTipRow(row as Record<string, unknown>),
    );

    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      tips = tips.filter((t) => t.text.toLowerCase().includes(q));
    }

    return { success: true, data: tips };
  } catch (err) {
    console.error("getProTips error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch pro tips",
    };
  }
}

export async function createProTip(
  input: CreateProTipFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/pro-tips");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("pro_tips").insert({
      icon: input.icon,
      text: input.text,
      category: input.category ?? null,
      priority: input.priority ?? 0,
      is_active: input.isActive ?? true,
    });

    if (error) throw error;
    revalidatePath("/pro-tips");
    return { success: true };
  } catch (err) {
    console.error("createProTip error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create pro tip",
    };
  }
}

export async function updateProTip(
  input: UpdateProTipFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/pro-tips");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.text !== undefined) updates.text = input.text;
    if (input.category !== undefined) updates.category = input.category;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.isActive !== undefined) updates.is_active = input.isActive;

    const { error } = await supabase
      .from("pro_tips")
      .update(updates)
      .eq("id", input.id);

    if (error) throw error;
    revalidatePath("/pro-tips");
    return { success: true };
  } catch (err) {
    console.error("updateProTip error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update pro tip",
    };
  }
}

export async function deleteProTip(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdminRoles(ADMIN_ONLY_ROLES);

  if (shouldUseMockData()) {
    revalidatePath("/pro-tips");
    return { success: true };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("pro_tips")
      .delete()
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/pro-tips");
    return { success: true };
  } catch (err) {
    console.error("deleteProTip error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete pro tip",
    };
  }
}

export async function toggleProTipActive(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  return updateProTip({ id, isActive });
}
