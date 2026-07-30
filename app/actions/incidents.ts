"use server";

import { requireCapability } from "@/lib/admin";
import {
  countOpenIncidents,
  createIncident as createIncidentRecord,
  listIncidents,
  updateIncidentStatus,
} from "@/features/incidents/supabaseIncidentStore";
import type {
  CreateIncidentInput,
  Incident,
  IncidentStatus,
} from "@/features/incidents/types";

export async function getIncidents(): Promise<{
  success: boolean;
  data?: Incident[];
  error?: string;
}> {
  try {
    await requireCapability("incidents.read");
    return { success: true, data: await listIncidents() };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load incidents",
    };
  }
}

export async function getOpenIncidentCount(): Promise<number> {
  try {
    await requireCapability("incidents.read");
    return await countOpenIncidents();
  } catch {
    return 0;
  }
}

export async function createIncident(
  input: CreateIncidentInput,
): Promise<{ success: boolean; data?: Incident; error?: string }> {
  try {
    const admin = await requireCapability("incidents.create", { mutation: true });
    if (!input.title.trim()) {
      return { success: false, error: "Title is required" };
    }
    const incident = await createIncidentRecord(
      input,
      admin.authUser.email ?? undefined,
    );
    return { success: true, data: incident };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create incident",
    };
  }
}

export async function setIncidentStatus(input: {
  id: string;
  status: IncidentStatus;
}): Promise<{ success: boolean; data?: Incident; error?: string }> {
  try {
    await requireCapability("incidents.manage", { mutation: true });
    const updated = await updateIncidentStatus(input.id, input.status);
    if (!updated) {
      return { success: false, error: "Incident not found" };
    }
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update incident",
    };
  }
}
