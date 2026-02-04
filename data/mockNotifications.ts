import { AdminNotification } from "@/schemas";

export const mockNotifications: AdminNotification[] = [
  {
    id: "notif-001",
    userId: "user-001",
    title: "New campaign assigned",
    message: "You have been assigned to the City Center Awareness campaign.",
    type: "campaign_assigned",
    metadata: {
      campaign_id: "camp-001",
      campaign_name: "City Center Awareness",
    },
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    recipient: {
      id: "user-001",
      name: "Mila Vermeer",
      email: "mila.vermeer@movrr.app",
      role: "rider",
    },
  },
  {
    id: "notif-002",
    userId: "user-002",
    title: "Route completed",
    message: "Nice work! Your route has been marked as completed.",
    type: "route_completed",
    metadata: {
      route_id: "route-014",
      campaign_id: "camp-008",
    },
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    recipient: {
      id: "user-002",
      name: "Jonas Bakker",
      email: "jonas.bakker@movrr.app",
      role: "rider",
    },
  },
  {
    id: "notif-003",
    userId: "user-003",
    title: "System update",
    message: "We have rolled out improved offline syncing for riders.",
    type: "system",
    metadata: {},
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    recipient: {
      id: "user-003",
      name: "Anouk Janssen",
      email: "anouk.janssen@movrr.app",
      role: "advertiser",
    },
  },
];
