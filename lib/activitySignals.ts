import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchRecentUserActivityMap } from "@/lib/userActivity";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const resolveLatestIsoTimestamp = (
  ...values: Array<string | null | undefined>
): string | undefined => {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) return undefined;
  return new Date(Math.max(...timestamps)).toISOString();
};

export const fetchAuthLastSignInMap = async (
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) => {
  if (userIds.length === 0) return new Map<string, string>();

  // auth.users is not accessible via PostgREST (.schema("auth") is blocked).
  // Use the Auth Admin API instead, which is available on the service-role client.
  // Paginate in batches of 1000 until all users are fetched.
  const idSet = new Set(userIds);
  const map = new Map<string, string>();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage,
      page,
    });

    if (error) {
      console.warn("Fetch auth last sign-in map error:", error.message);
      break;
    }

    for (const user of data.users) {
      if (idSet.has(user.id) && user.last_sign_in_at) {
        map.set(user.id, user.last_sign_in_at);
      }
    }

    // Stop if we've matched all requested users or this page was the last one
    if (data.users.length < perPage || map.size >= idSet.size) break;
    page += 1;
  }

  return map;
};

export const fetchLatestUserActivitySignalMap = async (
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) => {
  const [userActivityMap, authSignInMap] = await Promise.all([
    fetchRecentUserActivityMap(supabaseAdmin, userIds),
    fetchAuthLastSignInMap(supabaseAdmin, userIds),
  ]);

  const resolved = new Map<string, string>();
  userIds.forEach((userId) => {
    const timestamp = resolveLatestIsoTimestamp(
      userActivityMap.get(userId),
      authSignInMap.get(userId),
    );
    if (timestamp) {
      resolved.set(userId, timestamp);
    }
  });
  return resolved;
};
