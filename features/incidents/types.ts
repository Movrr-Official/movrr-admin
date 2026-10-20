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
};

export type CreateIncidentInput = {
  operationId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
};
