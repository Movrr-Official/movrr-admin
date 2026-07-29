/**
 * Port for inserting in-app notification rows (mirrors `notifications` table shape).
 * Infrastructure adapters (in-memory / Supabase) implement this contract.
 */
export type NotificationInsertInput = {
  userId: string;
  title: string;
  message: string;
  type: "reward" | "status" | "system";
  metadata?: Record<string, unknown>;
};

export type NotificationRow = NotificationInsertInput & {
  id: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationInsertPort = {
  insert: (input: NotificationInsertInput) => Promise<NotificationRow>;
};
