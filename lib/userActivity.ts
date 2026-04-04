import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type UserActivitySource =
  | "account"
  | "admin"
  | "admin_access"
  | "route"
  | "campaign"
  | "reward"
  | "waitlist"
  | "web"
  | "system";

export type UserActivityRecord = {
  user_id: string;
  actor_user_id?: string | null;
  source: UserActivitySource;
  action: string;
  description: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string;
};

const isMissingRelationError = (message?: string | null) => {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("relation") && normalized.includes("user_activity")
  );
};

export const writeUserActivities = async (
  supabaseAdmin: SupabaseAdminClient,
  activities: UserActivityRecord[],
) => {
  if (activities.length === 0) return;

  const payload = activities.map((activity) => ({
    user_id: activity.user_id,
    actor_user_id: activity.actor_user_id ?? null,
    source: activity.source,
    action: activity.action,
    description: activity.description,
    related_entity_type: activity.related_entity_type ?? null,
    related_entity_id: activity.related_entity_id ?? null,
    metadata: activity.metadata ?? {},
    occurred_at: activity.occurred_at ?? new Date().toISOString(),
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin.from("user_activity").insert(payload);

  if (!error) return;
  if (isMissingRelationError(error.message)) {
    console.warn(
      "user_activity table is not available yet; skipping activity write.",
    );
    return;
  }

  throw new Error(error.message);
};

export const writeUserActivity = async (
  supabaseAdmin: SupabaseAdminClient,
  activity: UserActivityRecord,
) => writeUserActivities(supabaseAdmin, [activity]);

export const fetchRecentUserActivityMap = async (
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) => {
  if (userIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabaseAdmin
    .from("user_activity")
    .select("user_id, occurred_at")
    .in("user_id", userIds)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(userIds.length * 4, 100));

  if (error) {
    if (isMissingRelationError(error.message)) {
      return new Map<string, string>();
    }
    console.warn("Fetch recent user activity map error:", error.message);
    return new Map<string, string>();
  }

  const latestByUser = new Map<string, string>();
  for (const row of data ?? []) {
    if (!row.user_id || !row.occurred_at || latestByUser.has(row.user_id)) {
      continue;
    }
    latestByUser.set(row.user_id, row.occurred_at);
  }

  return latestByUser;
};

export const fetchUserActivityFeed = async (
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  limit: number,
) => {
  const { data, error } = await supabaseAdmin
    .from("user_activity")
    .select(
      "id, source, action, description, related_entity_type, related_entity_id, metadata, occurred_at",
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelationError(error.message)) {
      return { data: [] as any[], available: false };
    }
    throw new Error(error.message);
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      source: row.source,
      action: row.action,
      description: row.description,
      related_entity_type: row.related_entity_type ?? undefined,
      related_entity_id: row.related_entity_id ?? undefined,
      metadata: row.metadata ?? {},
      created_at: row.occurred_at,
    })),
    available: true,
  };
};
