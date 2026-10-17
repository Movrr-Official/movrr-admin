import { beforeEach, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const { database, capability, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn() };
  return { query, database: { from: vi.fn() }, capability: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin", () => ({ requireCapability: capability }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => database }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/authorization/sodEnforcement", () => ({ enforceApprovalSod: vi.fn(), recordEntityInitiator: vi.fn() }));
vi.mock("@/features/campaigns/application/campaignRepository", () => ({ insertCampaignRecord: vi.fn(), updateCampaignRecord: vi.fn() }));
import { getCampaignZones } from "@/app/actions/campaigns";
import { CampaignZoneRetirementNotice } from "@/components/campaigns/CampaignZoneRetirementNotice";
beforeEach(() => {
  vi.clearAllMocks(); capability.mockResolvedValue({});
  database.from.mockReturnValue(query);
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [], error: null });
});
it("uses the service-only historical projection with the existing authorization gate and current-only default", async () => {
  await getCampaignZones("campaign");
  expect(capability).toHaveBeenCalledWith("campaigns.read");
  expect(database.from).toHaveBeenCalledWith("campaign_zone_history_geojson");
  expect(query.eq).toHaveBeenCalledWith("campaign_id", "campaign");
  expect(query.is).toHaveBeenCalledWith("retired_at", null);
});
it("retains identity, canonical GeoJSON and retirement details for authorized history", async () => {
  const geometry = { type: "Polygon", coordinates: [] };
  const row = { id: "zone", name: "Original name", geojson: geometry, retired_at: "2026-10-17T12:00:00Z", retirement_reason: "Obsolete synthetic source", retirement_operation_id: "operation" };
  query.order.mockResolvedValue({ data: [row], error: null });
  const result = await getCampaignZones("campaign", { includeRetired: true });
  expect(query.is).not.toHaveBeenCalled();
  expect(result.data?.[0]).toEqual({ ...row, geom: geometry });
  const html = renderToStaticMarkup(React.createElement(CampaignZoneRetirementNotice, { retiredAt: row.retired_at, reason: row.retirement_reason }));
  expect(html).toContain("Retired — historical area");
  expect(html).toContain(row.retirement_reason);
  expect(html).toContain("excluded from current operating areas");
});
it("does not disclose history without campaigns.read or convert failures into successful empty data", async () => {
  capability.mockRejectedValueOnce(new Error("Denied"));
  await expect(getCampaignZones("campaign", { includeRetired: true })).rejects.toThrow("Denied");
  expect(database.from).not.toHaveBeenCalled();
  query.order.mockResolvedValue({ data: null, error: { message: "Missing migration" } });
  expect((await getCampaignZones("campaign")).error).toEqual({ message: "Missing migration" });
});
