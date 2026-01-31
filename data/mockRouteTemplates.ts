export type TemplateStatus = "active" | "draft" | "paused";

export type RouteTemplate = {
  id: string;
  name: string;
  city: string;
  zone: string;
  ridersTarget: number;
  estimatedDistanceKm: number;
  lastSent: string;
  status: TemplateStatus;
  notes?: string;
};

export const mockRouteTemplates: RouteTemplate[] = [
  {
    id: "tmpl-001",
    name: "Downtown Morning Loop",
    city: "Nairobi",
    zone: "CBD",
    ridersTarget: 18,
    estimatedDistanceKm: 12.4,
    lastSent: "Today, 8:15 AM",
    status: "active" as const,
  },
  {
    id: "tmpl-002",
    name: "Westlands Brand Sweep",
    city: "Nairobi",
    zone: "Westlands",
    ridersTarget: 12,
    estimatedDistanceKm: 9.8,
    lastSent: "Yesterday, 4:40 PM",
    status: "paused" as const,
  },
  {
    id: "tmpl-003",
    name: "Industrial Park Refill",
    city: "Nairobi",
    zone: "Embakasi",
    ridersTarget: 22,
    estimatedDistanceKm: 15.1,
    lastSent: "Not sent yet",
    status: "draft" as const,
  },
];
