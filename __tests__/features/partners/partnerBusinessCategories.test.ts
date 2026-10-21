import { describe, it, expect, vi, beforeEach } from "vitest";
import { PARTNER_BUSINESS_CATEGORIES, isPartnerBusinessCategory } from "@/contracts/partnerBusinessCategory";
import { createOrganisationOpsCommands, createOrganisationOpsStore } from "@/features/organisations/application/organisationOps";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import { PublicLocationSchema } from "@/features/partners/domain/PartnerLocation";
import type { RequestContext } from "@/features/identity/domain/Principal";
const { db } = vi.hoisted(() => ({ db: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => db }));
import { createSupabaseOrganisationOpsStore } from "@/features/organisations/infrastructure/supabaseOrganisationOpsStore";
import { createSupabasePartnerLocationPort } from "@/features/partners/infrastructure/supabasePartnerLocations";

const id = "11111111-1111-4111-8111-111111111111";
const admin: RequestContext = { principal: { type: "admin", userId: id, email: null, adminUserId: id, role: "admin" }, permissions: ["rewards.manage"], correlationId: "category-test", audit: { actorUserId: id, actorEmail: null, principalType: "admin" } };
beforeEach(() => vi.clearAllMocks());

describe("authoritative business classification", () => {
  it.each(PARTNER_BUSINESS_CATEGORIES)("persists and reads %s through existing Admin operations", async businessCategory => {
    const store = createOrganisationOpsStore();
    const org = await store.createOrganisation({ name: "Partner", type: "reward_partner" });
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    const result = await commands.update(admin, { id: org.id, partnerProfile: { businessCategory } });
    expect(result.ok && result.value.partnerProfile?.businessCategory).toBe(businessCategory);
    expect((await store.findOrganisationById(org.id))?.partnerProfile?.businessCategory).toBe(businessCategory);
    await commands.update(admin, { id: org.id, name: "Renamed" });
    expect((await store.findOrganisationById(org.id))?.partnerProfile?.businessCategory).toBe(businessCategory);
    await commands.update(admin, { id: org.id, partnerProfile: { businessCategory: null } });
    expect((await store.findOrganisationById(org.id))?.partnerProfile?.businessCategory).toBeNull();
  });
  it.each(["food-drink", "Cafe", " cafe ", "unknown", 4, {}, "__proto__"])("rejects unsupported write %p", async value => {
    expect(isPartnerBusinessCategory(value)).toBe(false);
    const store = createOrganisationOpsStore();
    const update = vi.spyOn(store, "updateOrganisation");
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    expect((await commands.update(admin, { id, partnerProfile: { businessCategory: value as never } })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects non-partners, missing records, riders, organisation managers/owners and admins without capability before writing", async () => {
    const store = createOrganisationOpsStore();
    const org = await store.createOrganisation({ name: "Advertiser", type: "advertiser" });
    const update = vi.spyOn(store, "updateOrganisation");
    const commands = createOrganisationOpsCommands({ store, authorisation: authorisationService });
    expect((await commands.update(admin, { id: org.id, partnerProfile: { businessCategory: "cafe" } })).ok).toBe(false);
    expect((await commands.update(admin, { id, partnerProfile: { businessCategory: "cafe" } })).ok).toBe(false);
    for (const principal of [
      { type: "rider", userId: id, email: null, riderId: id },
      ...["manager", "owner"].map(role => ({ type: "organisation", userId: id, email: null, organisationId: id, membershipId: id, role })),
    ]) {
      expect((await commands.update({ ...admin, principal: principal as RequestContext["principal"] }, { id, partnerProfile: { businessCategory: "cafe" } })).ok).toBe(false);
    }
    expect((await commands.update({ ...admin, permissions: [] }, { id, partnerProfile: { businessCategory: "cafe" } })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it("passes category to the existing atomic RPC and maps its readback", async () => {
    const row = { id, name: "Partner", type: "reward_partner", status: "active", created_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z" };
    db.rpc.mockResolvedValue({ data: { organisation: row, partner: { ...row, business_category: "bookstore", organisation_id: id } }, error: null });
    const input = { id, partnerProfile: { businessCategory: "bookstore" as const } };
    const result = await createSupabaseOrganisationOpsStore().updateOrganisation(input);
    expect(db.rpc).toHaveBeenCalledWith("save_organisation_with_partner", { p_id: id, p_input: input });
    expect(result?.partnerProfile?.businessCategory).toBe("bookstore");
  });
  it.each([null, "cafe", "future-category"])("projects only public classification %p while retaining all discovery filters", async business_category => {
    const row = { id, organisation_id: id, partner_id: id, name: "Branch", address: "Address", latitude: 52, longitude: 4, status: "published", verified_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", partner: { name: "Partner", logo_url: null, business_category, contact_email: "private@example.test" } };
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "not", "gte", "lte", "gt", "order"]) query[method] = vi.fn(() => query);
    query.limit = vi.fn(async () => ({ data: [row], error: null }));
    const links = { select: vi.fn(() => links), in: vi.fn(() => links), eq: vi.fn(async () => ({ data: [], error: null })) };
    db.from.mockImplementation((table: string) => table === "reward_partner_location" ? query : links);
    const result = await createSupabasePartnerLocationPort().discover({ south: 51, north: 53, west: 3, east: 5, limit: 100 });
    expect(result[0].businessCategory).toBe(business_category);
    expect(result[0]).not.toHaveProperty("contactEmail");
    expect(result[0]).not.toHaveProperty("partner");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("business_category"));
    expect(query.eq.mock.calls).toEqual([["status", "published"], ["partner.status", "active"], ["organisation.status", "active"], ["organisation.type", "reward_partner"]]);
    expect(query.not).toHaveBeenCalledWith("verified_at", "is", null);
    expect(query.gte.mock.calls).toEqual([["latitude", 51], ["longitude", 3]]);
    expect(query.lte.mock.calls).toEqual([["latitude", 53], ["longitude", 5]]);
  });
  it("accepts old response shapes without a category", () => {
    expect(PublicLocationSchema.parse({ id, organisationId: id, partnerId: id, partnerName: "Partner", name: "Branch", address: "Address", latitude: 52, longitude: 4, updatedAt: "2026-10-17T00:00:00Z", rewards: [] })).not.toHaveProperty("businessCategory");
  });
});

describe("category HTTP update contract", () => {
  async function setup(actor = "admin") {
    const store = createOrganisationOpsStore();
    const org = await store.createOrganisation({ name: "Partner", type: "reward_partner" });
    const update = vi.spyOn(store, "updateOrganisation");
    const { createPlatformApiForTests } = await import("@/features/platform/infrastructure/composePlatformApi");
    const api = await createPlatformApiForTests({ organisationStore: store, authDeps: {
      verifyAccessToken: async () => ({ userId: id, email: null }),
      findAdminUser: async () => ["admin", "support"].includes(actor) ? { id, userId: id, email: null, role: actor === "admin" ? "operations_manager" : "support_agent" } : null,
      findOrganisationMembership: async () => actor === "owner" ? { id, organisationId: org.id, userId: id, role: "owner", organisationType: "reward_partner" } : null,
      findRiderProfile: async () => actor === "rider" ? { id, userId: id } : null,
    } });
    const request = (businessCategory: unknown, authenticated = true) => new Request("https://example.test/api/v1/organisations/" + org.id, {
      method: "PATCH", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer local-test-token" } : {}) },
      body: JSON.stringify({ partnerProfile: { businessCategory } }),
    });
    return { api, org, store, update, request };
  }
  it("round-trips an Admin assignment and explicit null clear through the real HTTP handler", async () => {
    const { api, org, store, request } = await setup();
    for (const category of ["cafe", null]) {
      const response = await api.organisations.update(request(category), { id: org.id });
      expect(response.status).toBe(200);
      expect((await response.json()).data.partnerProfile.businessCategory).toBe(category);
      expect((await store.findOrganisationById(org.id))?.partnerProfile?.businessCategory).toBe(category);
    }
  });
  it.each(["food-drink", "CAFE", " cafe ", {}, 7, ""])("rejects invalid category %p with 400 and no write", async value => {
    const { api, org, update, request } = await setup();
    expect((await api.organisations.update(request(value), { id: org.id })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
  it.each(["support", "owner", "rider"])("rejects actor %s with 403 and no write", async actor => {
    const { api, org, update, request } = await setup(actor);
    expect((await api.organisations.update(request("cafe"), { id: org.id })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated writes with 401", async () => {
    const { api, org, update, request } = await setup();
    expect((await api.organisations.update(request("cafe", false), { id: org.id })).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });
});
