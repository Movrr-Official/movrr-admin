import { createClient } from "@supabase/supabase-js";

export const createSupabaseAdminClient = async () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Never expose publicly
  );
};
