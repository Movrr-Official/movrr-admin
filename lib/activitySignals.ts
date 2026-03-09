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

  const { data, error } = await supabaseAdmin
    .schema("auth")
    .from("users")
    .select("id, last_sign_in_at")
    .in("id", userIds);

  if (error) {
    console.warn("Fetch auth last sign-in map error:", error.message);
    return new Map<string, string>();
  }

  return new Map(
    (data ?? [])
      .filter((row) => row.id && row.last_sign_in_at)
      .map((row) => [row.id as string, row.last_sign_in_at as string]),
  );
};

export const fetchRecentAdminAccessMap = async (
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) => {
  if (userIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabaseAdmin
    .from("admin_access_logs")
    .select("user_id, created_at, success")
    .in("user_id", userIds)
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(Math.max(userIds.length * 3, 50));

  if (error) {
    console.warn("Fetch recent admin access map error:", error.message);
    return new Map<string, string>();
  }

  const latestByUser = new Map<string, string>();
  for (const row of data ?? []) {
    if (!row.user_id || !row.created_at || latestByUser.has(row.user_id)) {
      continue;
    }
    latestByUser.set(row.user_id, row.created_at);
  }

  return latestByUser;
};

export const fetchLatestUserActivitySignalMap = async (
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) => {
  const [userActivityMap, adminAccessMap, authSignInMap] = await Promise.all([
    fetchRecentUserActivityMap(supabaseAdmin, userIds),
    fetchRecentAdminAccessMap(supabaseAdmin, userIds),
    fetchAuthLastSignInMap(supabaseAdmin, userIds),
  ]);

  const resolved = new Map<string, string>();
  userIds.forEach((userId) => {
    const timestamp = resolveLatestIsoTimestamp(
      userActivityMap.get(userId),
      adminAccessMap.get(userId),
      authSignInMap.get(userId),
    );
    if (timestamp) {
      resolved.set(userId, timestamp);
    }
  });
  return resolved;
};
