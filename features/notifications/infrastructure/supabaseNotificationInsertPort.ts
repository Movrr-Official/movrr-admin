import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  NotificationInsertInput,
  NotificationInsertPort,
  NotificationRow,
} from "@/features/notifications/application/contracts/NotificationInsertPort";

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/**
 * Durable notification inserts into public.notifications (best-effort shape).
 */
export function createSupabaseNotificationInsertPort(): NotificationInsertPort {
  return {
    async insert(input: NotificationInsertInput): Promise<NotificationRow> {
      const supabase = createSupabaseAdminClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id: input.userId,
          title: input.title,
          message: input.message,
          type: input.type,
          metadata: input.metadata ?? {},
          created_at: now,
        })
        .select("id, user_id, title, message, type, metadata, created_at")
        .single();
      throwOnError(error, "notifications.insert");

      return {
        id: String(data.id),
        userId: String(data.user_id),
        title: String(data.title),
        message: String(data.message),
        type: data.type as NotificationRow["type"],
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        createdAt: String(data.created_at ?? now),
      };
    },
  };
}
