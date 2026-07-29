import { randomUUID } from "crypto";
import type {
  NotificationInsertInput,
  NotificationInsertPort,
  NotificationRow,
} from "@/features/notifications/application/contracts/NotificationInsertPort";

export type InMemoryNotificationInsertPort = NotificationInsertPort & {
  list: () => NotificationRow[];
};

/** In-memory notification insert port for unit tests / Phase-1 composition. */
export function createInMemoryNotificationInsertPort(): InMemoryNotificationInsertPort {
  const rows: NotificationRow[] = [];

  return {
    async insert(input: NotificationInsertInput): Promise<NotificationRow> {
      const row: NotificationRow = {
        id: randomUUID(),
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type,
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },

    list(): NotificationRow[] {
      return [...rows];
    },
  };
}
