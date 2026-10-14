import { createClient } from "@supabase/supabase-js";
import { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./env";
import { logger } from "./logger";
import { coordinatedManagedFetch } from "./managedWritePermit";
import { createSupabaseServerClient } from "./supabase-server";

export const createSupabaseAdminClient = () => {
  try {
    const rpcClient = createClient(NEXT_PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    return createClient(
      NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY!, // Never expose publicly
      {
        global: { fetch: coordinatedManagedFetch({
          rpc: (name, args) => rpcClient.rpc(name, args),
          actor: async () => {
            const session = await createSupabaseServerClient();
            const { data, error } = await session.auth.getUser();
            if (error || !data.user) throw new Error("authenticated_managed_writer_required");
            return data.user.id;
          },
        }) },
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
