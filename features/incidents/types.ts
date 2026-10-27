export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus = "open" | "investigating" | "resolved" | "closed";

export type Incident = {
  id: string;
  version: number;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  settlementOperations?: {
    condition: string;
    active: boolean;
    observedCount: number;
    ownerRole: "super_admin";
    acknowledgedAt: string | null;
    escalatedAt: string | null;
    deliveries: Array<{ operation: string; phase: string; attempts: number; deliveredAt: string | null; nextAttemptAt: string; deadLetterAt: string | null; category: string | null }>;
  } | null;
};

export type CreateIncidentInput = {
  operationId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
};
