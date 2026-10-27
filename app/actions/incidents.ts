"use server";

import { requireCapability } from "@/lib/admin";
import {
  countOpenIncidents,
  createIncident as createIncidentRecord,
  listIncidents,
  updateIncidentStatus,
  acknowledgeSettlementIncident,
  retrySettlementDelivery,
} from "@/features/incidents/supabaseIncidentStore";
import type {
  CreateIncidentInput,
  Incident,
  IncidentStatus,
} from "@/features/incidents/types";

export async function acknowledgeSettlement(input: { id: string; operationId: string }) {
  try {
    await requireCapability("incidents.manage", { mutation: true });
    return { success: true, data: await acknowledgeSettlementIncident(input.id, input.operationId) };
  } catch {
    return { success: false, error: "Acknowledgement requires the assigned Super Admin and an MFA verified session. Refresh before retrying." };
  }
}
export async function retrySettlementAlert(input: { delivery: string; operationId: string; reason: string }) {
  try {
    await requireCapability("incidents.manage", { mutation: true });
    return { success: true, data: await retrySettlementDelivery(input.delivery, input.operationId, input.reason) };
  } catch {
    return { success: false, error: "Retry unavailable. Verify your assigned owner, MFA session and dead-letter status." };
  }
}

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
      error: error instanceof Error ? error.message : "Failed to load incidents",
    };
  }
}

export async function getOpenIncidentCount(): Promise<number> {
  try {
    await requireCapability("incidents.read");
    return await countOpenIncidents();
  } catch {
    throw new Error("Incident count unavailable");
  }
}

export async function createIncident(
  input: CreateIncidentInput,
): Promise<{ success: boolean; data?: Incident; error?: string }> {
  try {
    await requireCapability("incidents.create", { mutation: true });
    if (!input.title.trim()) {
      return { success: false, error: "Title is required" };
    }
    const incident = await createIncidentRecord(input);
    return { success: true, data: incident };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create incident",
    };
  }
}

export async function setIncidentStatus(input: {
  id: string;
  status: IncidentStatus;
  expectedVersion: number;
  operationId: string;
}): Promise<{ success: boolean; data?: Incident; error?: string }> {
  try {
    await requireCapability("incidents.manage", { mutation: true });
    const updated = await updateIncidentStatus(
      input.id,
      input.status,
      input.expectedVersion,
      input.operationId,
    );
    if (!updated) {
      return { success: false, error: "Incident not found" };
    }
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update incident",
    };
  }
}
