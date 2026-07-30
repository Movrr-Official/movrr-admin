import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  CreateIncidentInput,
  Incident,
  IncidentStatus,
} from "./types";
import { SEED_INCIDENTS } from "./seedIncidents";

const SETTINGS_KEY = "ops_incidents";

type IncidentStorePayload = {
  incidents: Incident[];
};

async function loadPayload(): Promise<IncidentStorePayload> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const value = data?.value as IncidentStorePayload | null;
  if (value?.incidents?.length) {
    return { incidents: value.incidents };
  }

  return { incidents: [...SEED_INCIDENTS] };
}

async function savePayload(payload: IncidentStorePayload): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key: SETTINGS_KEY,
      value: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

const newId = () =>
  `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function listIncidents(): Promise<Incident[]> {
  const payload = await loadPayload();
  return [...payload.incidents].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function countOpenIncidents(): Promise<number> {
  const payload = await loadPayload();
  return payload.incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;
}

export async function createIncident(
  input: CreateIncidentInput,
  createdBy?: string,
): Promise<Incident> {
  const payload = await loadPayload();
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
  payload.incidents = [incident, ...payload.incidents];
  await savePayload(payload);
  return incident;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
): Promise<Incident | null> {
  const payload = await loadPayload();
  const index = payload.incidents.findIndex((incident) => incident.id === id);
  if (index < 0) return null;

  const updated: Incident = {
    ...payload.incidents[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  payload.incidents = [
    ...payload.incidents.slice(0, index),
    updated,
    ...payload.incidents.slice(index + 1),
  ];
  await savePayload(payload);
  return updated;
}
