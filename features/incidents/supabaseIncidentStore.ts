import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CreateIncidentInput, Incident, IncidentStatus } from "./types";
import { z } from "zod";
export async function acknowledgeSettlementIncident(id: string, operationId: string): Promise<Incident> {
  z.object({ id: z.string().uuid(), operationId: z.string().uuid() }).parse({ id, operationId });
  const { data, error } = await (await createSupabaseServerClient()).rpc("acknowledge_ride_ops_incident", { p_incident: id, p_operation: operationId });
  if (error) throw new Error("Acknowledgement requires the assigned Super Admin and an MFA verified session. Refresh before retrying.");
  return data as Incident;
}
export async function retrySettlementDelivery(delivery: string, operationId: string, reason: string) {
  z.object({ delivery: z.string().uuid(), operationId: z.string().uuid(), reason: z.string().trim().min(10).max(500) }).parse({ delivery, operationId, reason });
  const { data, error } = await (await createSupabaseServerClient()).rpc("retry_ride_ops_delivery", { p_delivery: delivery, p_operation: operationId, p_reason: reason });
  if (error) throw new Error("Delivery retry requires the assigned Super Admin, MFA and a dead letter. Refresh before retrying.");
  return data;
}
export async function listIncidents(): Promise<Incident[]> {
  const { data, error } = await (
    await createSupabaseServerClient()
  ).rpc("ops_list_incidents");
  if (error) throw new Error("Incident store unavailable");
  return data as Incident[];
}
export async function countOpenIncidents() {
  return (await listIncidents()).filter((i) =>
    ["open", "investigating"].includes(i.status),
  ).length;
}
export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  z.object({
    operationId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000),
    severity: z.enum(["low", "medium", "high", "critical"]),
  }).parse(input);
  const { operationId, ...payload } = input;
  const { data, error } = await (
    await createSupabaseServerClient()
  ).rpc("ops_incident_command", {
    p_id: null,
    p_status: null,
    p_expected: null,
    p_payload: payload,
    p_operation: operationId,
  });
  if (error) throw new Error("Incident creation failed. Retry the same operation.");
  return data as Incident;
}
export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  expectedVersion: number,
  operationId: string,
): Promise<Incident> {
  z.object({
    id: z.string().min(1).max(100),
    status: z.enum(["open", "investigating", "resolved", "closed"]),
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  }).parse({ id, status, expectedVersion, operationId });
  const { data, error } = await (
    await createSupabaseServerClient()
  ).rpc("ops_incident_command", {
    p_id: id,
    p_status: status,
    p_expected: expectedVersion,
    p_payload: null,
    p_operation: operationId,
  });
  if (error)
    throw new Error(
      error.code === "40001"
        ? "Incident changed. Refresh before updating."
        : "Incident update unavailable. Retry the same operation.",
    );
  return data as Incident;
}
