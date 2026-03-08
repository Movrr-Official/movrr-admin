"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } from "./env";

export const createSupabaseServerClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const entries = cookieStore.getAll();
          return entries.map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set({ name, value, ...options });
            } catch {
              // Server components can read cookies but cannot always mutate them.
              // Supabase may still attempt a refresh-path write during auth lookups;
              // ignore those writes here and let route handlers/server actions own cookie mutation.
            }
          });
        },
      },
    },
  );
};
