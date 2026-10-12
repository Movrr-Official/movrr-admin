import { describe, it, expect, vi } from "vitest";
import {
  BoundsSchema,
  LocationInputSchema,
} from "@/features/partners/domain/PartnerLocation";
import { createPartnerLocationService } from "@/features/partners/application/partnerLocationService";
import type { RequestContext } from "@/features/identity/domain/Principal";
const id = "11111111-1111-4111-8111-111111111111";
const rider: RequestContext = {
  principal: { type: "rider", userId: id, email: null, riderId: id },
  correlationId: "test",
  permissions: ["rewards.catalog.read"],
  audit: { actorUserId: id, actorEmail: null, principalType: "rider" },
};
const admin: RequestContext = {
  ...rider,
  permissions: ["rewards.manage"],
  principal: {
    type: "admin",
    userId: id,
    email: null,
    adminUserId: id,
    role: "admin",
  },
};
const input = {
  name: "Branch",
  address: "Real address",
  latitude: 52,
  longitude: 4,
  status: "published",
  coordinatesVerified: true,
  rewardIds: [id],
};
function setup() {
  const port = {
    discover: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    save: vi
      .fn()
      .mockResolvedValue({
        ...input,
        id,
        organisationId: id,
        partnerId: id,
        updatedAt: "2026-10-12T00:00:00.000Z",
      }),
    hit: vi.fn().mockResolvedValue(true),
  };
  return { port, service: createPartnerLocationService(port) };
}
describe("authoritative physical partner locations", () => {
  it("denies admin writes without operational capability", async () => {
    const { port, service } = setup();
    expect(
      (await service.save({ ...admin, permissions: [] }, id, input)).ok,
    ).toBe(false);
    expect(port.save).not.toHaveBeenCalled();
  });
  it("creates independent branches under the same organisation", async () => {
    const { port, service } = setup();
    await service.save(admin, id, input);
    await service.save(admin, id, {
      ...input,
      name: "Second branch",
      latitude: 52.01,
    });
    expect(port.save).toHaveBeenCalledTimes(2);
    expect(port.save.mock.calls.every((call) => call[0] === id)).toBe(true);
  });
  it("rejects missing or unreviewed coordinates on publication", () => {
    expect(
      LocationInputSchema.safeParse({ ...input, coordinatesVerified: false })
        .success,
    ).toBe(false);
    expect(
      LocationInputSchema.safeParse({
        ...input,
        latitude: null,
        longitude: null,
      }).success,
    ).toBe(false);
    expect(
      LocationInputSchema.safeParse({ ...input, latitude: NaN }).success,
    ).toBe(false);
    expect(
      LocationInputSchema.safeParse({
        ...input,
        status: "draft",
        latitude: null,
        longitude: null,
      }).success,
    ).toBe(true);
  });
  it("requires optimistic concurrency for edits and accepts multiple location IDs per organisation", () => {
    expect(LocationInputSchema.safeParse({ ...input, id }).success).toBe(false);
    expect(
      LocationInputSchema.safeParse({
        ...input,
        id,
        expectedUpdatedAt: "2026-10-12T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
  it("bounds discovery and result limits", () => {
    for (const bad of [
      { south: 52, north: 54, west: 4, east: 4.1 },
      { south: 52, north: 51, west: 4, east: 4.1 },
      { south: 52, north: 52.1, west: 4, east: 4.1, limit: 101 },
    ])
      expect(BoundsSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects rider writes before touching persistence", async () => {
    const { port, service } = setup();
    expect((await service.save(rider, id, input)).ok).toBe(false);
    expect((await service.list(rider, id)).ok).toBe(false);
    expect(port.save).not.toHaveBeenCalled();
    expect(port.list).not.toHaveBeenCalled();
  });
  it("preserves partner identity, explicit reward links and audit actor", async () => {
    const { port, service } = setup();
    expect((await service.save(admin, id, input)).ok).toBe(true);
    expect(port.save).toHaveBeenCalledWith(id, input, id, "test");
  });
  it("applies rate limits and never calls discovery for invalid bounds", async () => {
    const { port, service } = setup();
    await service.discover(rider, { south: 52, north: 53, west: 4, east: 5 });
    expect(port.discover).not.toHaveBeenCalled();
    port.hit.mockResolvedValue(false);
    expect(
      (
        await service.discover(rider, {
          south: 52,
          north: 52.1,
          west: 4,
          east: 4.1,
        })
      ).ok,
    ).toBe(false);
    expect(port.discover).not.toHaveBeenCalled();
  });
});
