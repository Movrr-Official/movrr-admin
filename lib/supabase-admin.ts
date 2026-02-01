import { createClient } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env";
import { logger } from "./logger";

export const createSupabaseAdminClient = () => {
  try {
    return createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY!, // Never expose publicly
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  } catch (error) {
    logger.error("Failed to create Supabase admin client", error);
    throw error;
  }
};
