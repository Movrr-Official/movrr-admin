import { AuditLog } from "@/schemas";

export const mockAuditLogs: AuditLog[] = [
  {
    id: "1",
    action: "User Role Changed",
    performedBy: {
      id: "admin1",
      name: "Admin User",
      email: "admin@movrr.com",
      role: "admin",
    },
    affectedEntity: {
      type: "User",
      id: "user2",
      name: "Advertiser User",
    },
    metadata: {
      from: "advertiser",
      to: "admin",
    },
    timestamp: "2023-06-20T14:32:00Z",
  },
  {
    id: "2",
    action: "Campaign Created",
    performedBy: {
      id: "advertiser1",
      name: "Advertiser User",
      email: "advertiser@example.com",
      role: "advertiser",
    },
    affectedEntity: {
      type: "Campaign",
      id: "campaign1",
      name: "Summer Promotion",
    },
    timestamp: "2023-06-19T09:15:00Z",
  },
  {
    id: "3",
    action: "Route Optimized",
    performedBy: {
      id: "ops1",
      name: "Operations Manager",
      email: "ops@movrr.com",
      role: "operations",
    },
    affectedEntity: {
      type: "Route",
      id: "route45",
      name: "Downtown Delivery",
    },
    timestamp: "2023-06-21T07:45:00Z",
  },
  {
    id: "4",
    action: "System Settings Changed",
    performedBy: {
      id: "sysadmin1",
      name: "System Admin",
      email: "sysadmin@movrr.com",
      role: "admin",
    },
    affectedEntity: {
      type: "System",
      id: "sys1",
      name: "Global Settings",
    },
    timestamp: "2023-06-22T12:10:00Z",
  },
  {
    id: "5",
    action: "Billing Updated",
    performedBy: {
      id: "billing1",
      name: "Billing Assistant",
      email: "billing@movrr.com",
      role: "finance",
    },
    affectedEntity: {
      type: "Account",
      id: "acc1",
      name: "Movrr Media",
    },
    timestamp: "2023-06-23T10:50:00Z",
  },
  {
    id: "6",
    action: "Campaign Edited",
    performedBy: {
      id: "advertiser2",
      name: "Creative Director",
      email: "creative@agency.com",
      role: "advertiser",
    },
    affectedEntity: {
      type: "Campaign",
      id: "camp42",
      name: "Back-to-School",
    },
    timestamp: "2023-06-24T15:30:00Z",
  },
  {
    id: "7",
    action: "User Status Changed",
    performedBy: {
      id: "admin2",
      name: "Moderator",
      email: "mod@movrr.com",
      role: "admin",
    },
    affectedEntity: {
      type: "User",
      id: "user5",
      name: "Freelance Designer",
    },
    metadata: {
      from: "active",
      to: "suspended",
    },
    timestamp: "2023-06-25T11:25:00Z",
  },
];
