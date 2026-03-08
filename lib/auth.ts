import { createSupabaseBrowserClient } from "./supabase-client";

export const supabase = createSupabaseBrowserClient();

type RiderSignupInput = {
  email: string;
  password: string;
  fullName: string;
  city?: string;
  country?: string;
  phone?: string;
};

export const signInWithEmail = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async ({
  email,
  password,
  fullName,
  city,
  country,
  phone,
}: RiderSignupInput) => {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: {
        full_name: fullName.trim(),
        city: city?.trim() || undefined,
        country: country?.trim() || undefined,
        phone: phone?.trim() || undefined,
        server_assigned_role: "rider",
      },
    },
  });
};

export const signInWithProvider = async (provider: "github" | "google") => {
  return await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${location.origin}/auth/callback`,
    },
  });
};

export const sendMagicLink = async (email: string) => {
  return await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
};

export const resetPassword = async (email: string) => {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });
};

export const updatePassword = async (password: string) => {
  return await supabase.auth.updateUser({ password });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};
