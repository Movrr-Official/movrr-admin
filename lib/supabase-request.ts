import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } from "./env";
import { extractBearerToken } from "./http/platformRoute";

/** Call only inside an authenticated platformRoute handler; preserve auth.uid() and RLS. */
export function createSupabaseRequestClient(request: Request) {
  const token = extractBearerToken(request);
  if (!token) throw new Error("Authenticated bearer session required");
  return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
