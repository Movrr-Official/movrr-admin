import { createBrowserClient } from "@supabase/ssr";
import { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } from "./env";

// Note: supabaseAdmin uses the SERVICE_ANON_KEY which you must only use in a secure server environment.
// NEVER expose this key on the client side.

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
