"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logger } from "@/lib/logger";
import {
  AdminNotification,
  CreateNotificationInput,
  NotificationFilters,
  NotificationRecipient,
  NotificationStats,
  createNotificationSchema,
  notificationFiltersSchema,
} from "@/schemas";

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
    await requireCapability("notifications.read");
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
    logger.warn("getNotificationHistory error", {
      error: error instanceof Error ? error.message : String(error),
    });
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
    await requireCapability("notifications.read");
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
    logger.warn("getNotificationStats error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch notification stats",
    };
  }
}

export async function createNotifications(payload: CreateNotificationInput) {
  try {
    await requireCapability("notifications.send", { mutation: true });
    const { operationId, ...body } = createNotificationSchema.parse(payload);
    const client = await createSupabaseServerClient();
    const queued = await client.rpc("ops_queue_notifications", { p_operation: operationId, p_payload: body });
    if (queued.error) throw new Error("Notification queue unavailable. Retry the same operation.");
    return await resumeNotificationSend(operationId);
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Notification send unavailable" }; }
}
export async function resumeNotificationSend(operationId: string) {
  try {
    await requireCapability("notifications.send", { mutation: true });
    z.string().uuid().parse(operationId);
    const { data, error } = await (await createSupabaseServerClient()).rpc("ops_deliver_notification_batch", { p_operation: operationId, p_limit: 500 });
    if (error) throw new Error("Notification batch unavailable. Retry the same operation.");
    revalidatePath("/notifications");
    return { success: true as const, data: data as { operationId: string; createdCount: number; recipientCount: number; pendingCount: number; skippedCount: number } };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Notification batch unavailable" }; }
}
export async function getPendingNotificationSends() {
  await requireCapability("notifications.send", { mutation: true });
  const { data, error } = await (await createSupabaseServerClient()).rpc("ops_pending_notification_sends");
  if (error) throw new Error("Notification recovery queue unavailable");
  return data as Array<{ operationId: string; createdCount: number; recipientCount: number; pendingCount: number }>;
}
