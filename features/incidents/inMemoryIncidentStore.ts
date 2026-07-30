import type {
  CreateIncidentInput,
  Incident,
  IncidentStatus,
} from "./types";

/** MVP seed data — persisted in-process for the server lifetime. */
const SEED_INCIDENTS: Incident[] = [
  {
    id: "inc-001",
    title: "Elevated ride verification rejections",
    description:
      "Manual review queue grew after GPS quality threshold change in Amsterdam region.",
    severity: "medium",
    status: "investigating",
    createdAt: "2026-07-28T09:15:00.000Z",
    updatedAt: "2026-07-29T14:22:00.000Z",
    createdBy: "ops@movrr.nl",
  },
  {
    id: "inc-002",
    title: "Fulfilment retry backlog",
    description:
      "Partner webhook latency caused repeated retry attempts on redemption inc-8842.",
    severity: "low",
    status: "open",
    createdAt: "2026-07-30T07:40:00.000Z",
    updatedAt: "2026-07-30T07:40:00.000Z",
    createdBy: "ops@movrr.nl",
  },
];

let incidents: Incident[] = [...SEED_INCIDENTS];

const newId = () =>
  `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function listIncidents(): Incident[] {
  return [...incidents].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function countOpenIncidents(): number {
  return incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;
}

export function createIncident(
  input: CreateIncidentInput,
  createdBy?: string,
): Incident {
  const now = new Date().toISOString();
  const incident: Incident = {
    id: newId(),
    title: input.title.trim(),
    description: input.description.trim(),
    severity: input.severity,
    status: "open",
    createdAt: now,
    updatedAt: now,
    createdBy,
  };
  incidents = [incident, ...incidents];
  return incident;
}

export function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
): Incident | null {
  const index = incidents.findIndex((incident) => incident.id === id);
  if (index < 0) return null;
  const updated: Incident = {
    ...incidents[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  incidents = [
    ...incidents.slice(0, index),
    updated,
    ...incidents.slice(index + 1),
  ];
  return updated;
}
