import { createBrowserClient } from "@supabase/ssr";

// Note: supabaseAdmin uses the SERVICE_ANON_KEY which you must only use in a secure server environment.
// NEVER expose this key on the client side.

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
