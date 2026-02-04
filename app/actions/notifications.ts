"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  AdminNotification,
  CreateNotificationInput,
  NotificationFilters,
  NotificationRecipient,
  NotificationStats,
  createNotificationSchema,
  notificationFiltersSchema,
} from "@/schemas";

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const normalizeMetadata = (metadata: Record<string, any> | undefined) =>
  metadata ?? {};

const getOptedOutUserIds = async () => {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("user_preferences")
    .select("user_id")
    .eq("notifications", false);

  if (error) {
    console.warn("Failed to load notification preferences", error);
    return [] as string[];
  }

  return (data ?? []).map((row) => row.user_id);
};

const mapNotificationRow = (
  row: any,
  recipientsById: Map<string, NotificationRecipient>,
): AdminNotification => {
  const recipient = recipientsById.get(row.user_id);

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    metadata: row.metadata ?? {},
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    recipient: recipient
      ? {
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
          role: recipient.role,
        }
      : undefined,
  };
};

const notificationFiltersFallback: NotificationFilters = {
  status: "all",
};

export async function getNotificationHistory(
  filters: NotificationFilters = notificationFiltersFallback,
): Promise<{ success: boolean; data?: AdminNotification[]; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedFilters = notificationFiltersSchema.parse(filters);
    const limit = validatedFilters.limit ?? 200;

    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (validatedFilters.type) {
      query = query.eq("type", validatedFilters.type);
    }

    if (validatedFilters.status === "read") {
      query = query.eq("is_read", true);
    }

    if (validatedFilters.status === "unread") {
      query = query.eq("is_read", false);
    }

    if (validatedFilters.searchQuery) {
      const q = validatedFilters.searchQuery.trim();
      if (q) {
        query = query.or(`title.ilike.%${q}%,message.ilike.%${q}%`);
      }
    }

    if (validatedFilters.startDate) {
      query = query.gte("created_at", validatedFilters.startDate);
    }

    if (validatedFilters.endDate) {
      query = query.lte("created_at", validatedFilters.endDate);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    const notificationRows = data ?? [];
    const userIds = Array.from(
      new Set(notificationRows.map((row) => row.user_id)),
    );

    let recipientsById = new Map<string, NotificationRecipient>();

    if (userIds.length > 0) {
      const { data: recipients, error: recipientsError } = await supabaseAdmin
        .from("user")
        .select("id,name,email,role")
        .in("id", userIds);

      if (!recipientsError && recipients) {
        recipientsById = new Map(
          recipients.map((recipient) => [recipient.id, recipient]),
        );
      }
    }

    return {
      success: true,
      data: notificationRows.map((row) =>
        mapNotificationRow(row, recipientsById),
      ),
    };
  } catch (error) {
    console.error("getNotificationHistory error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch notifications",
    };
  }
}

export async function getNotificationStats(): Promise<{
  success: boolean;
  data?: NotificationStats;
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { count: total, error: totalError } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true });

    if (totalError) {
      return { success: false, error: totalError.message };
    }

    const { count: unread, error: unreadError } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    if (unreadError) {
      return { success: false, error: unreadError.message };
    }

    const { count: read, error: readError } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", true);

    if (readError) {
      return { success: false, error: readError.message };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: last7Days, error: last7DaysError } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString());

    if (last7DaysError) {
      return { success: false, error: last7DaysError.message };
    }

    return {
      success: true,
      data: {
        total: total ?? 0,
        read: read ?? 0,
        unread: unread ?? 0,
        last7Days: last7Days ?? 0,
      },
    };
  } catch (error) {
    console.error("getNotificationStats error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch notification stats",
    };
  }
}

export async function createNotifications(
  payload: CreateNotificationInput,
): Promise<{
  success: boolean;
  data?: { createdCount: number; recipientCount: number };
  error?: string;
}> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const validatedPayload = createNotificationSchema.parse(payload);

    let query = supabaseAdmin.from("user").select("id");

    if (validatedPayload.target === "role") {
      query = query.eq("role", validatedPayload.role);
    }

    if (validatedPayload.target === "userIds") {
      query = query.in("id", validatedPayload.userIds ?? []);
    }

    if (validatedPayload.respectPreferences) {
      const optedOutIds = await getOptedOutUserIds();
      if (optedOutIds.length > 0) {
        const quotedIds = optedOutIds.map((id) => `"${id}"`).join(",");
        query = query.not("id", "in", `(${quotedIds})`);
      }
    }

    const { data: recipients, error: recipientsError } = await query;

    if (recipientsError) {
      return { success: false, error: recipientsError.message };
    }

    const recipientIds = (recipients ?? []).map((recipient) => recipient.id);

    if (recipientIds.length === 0) {
      return {
        success: true,
        data: { createdCount: 0, recipientCount: 0 },
      };
    }

    const rows = recipientIds.map((userId) => ({
      user_id: userId,
      type: validatedPayload.type,
      title: validatedPayload.title,
      message: validatedPayload.message,
      metadata: normalizeMetadata(validatedPayload.metadata),
    }));

    const chunks = chunkArray(rows, 500);
    let createdCount = 0;

    for (const chunk of chunks) {
      const { error } = await supabaseAdmin.from("notifications").insert(chunk);
      if (error) {
        return { success: false, error: error.message };
      }
      createdCount += chunk.length;
    }

    revalidatePath("/notifications");

    return {
      success: true,
      data: { createdCount, recipientCount: recipientIds.length },
    };
  } catch (error) {
    console.error("createNotifications error:", error);
    return {
      success: false,
      error:
        error instanceof z.ZodError
          ? error.errors[0]?.message
          : error instanceof Error
            ? error.message
            : "Failed to create notifications",
    };
  }
}
