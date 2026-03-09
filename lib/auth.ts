import { createSupabaseBrowserClient } from "./supabase-client";

export const supabase = createSupabaseBrowserClient();

export const signInWithEmail = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

export const updatePassword = async (password: string) => {
  return await supabase.auth.updateUser({ password });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};
