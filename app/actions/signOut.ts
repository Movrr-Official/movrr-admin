"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { clearAdminDashboardSession } from "@/lib/admin";

export async function signOutAdmin(): Promise<{ success: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await clearAdminDashboardSession(user.id);
  }

  await supabase.auth.signOut();
  return { success: true };
}
