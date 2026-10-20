import { beforeEach, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
const state = vi.hoisted(() => ({ role: "admin", from: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: vi.fn(async (capability: string) => {
  if (!employeeHasCapability(state.role, capability)) throw new Error("Missing capability");
  return { authUser: { id: "staff" } };
}) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ from: state.from }) }));
vi.mock("@/lib/activitySignals", () => ({ fetchLatestUserActivitySignalMap: vi.fn(), resolveLatestIsoTimestamp: vi.fn() }));
vi.mock("@/lib/userActivity", () => ({ writeUserActivity: state.audit }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
import { getCommunityRideCreatorAccess, setCommunityRideCreatorAccess } from "@/app/actions/riders";
const input = { userId: "11111111-1111-4111-8111-111111111111", riderId: "22222222-2222-4222-8222-222222222222", allow: true, note: "Reviewed rider" };
beforeEach(() => {
  vi.clearAllMocks(); state.role = "admin";
  state.upsert.mockResolvedValue({ error: null }); state.audit.mockResolvedValue(undefined);
  state.maybeSingle.mockResolvedValue({ data: { user_id: input.userId, revoked_at: null, note: input.note }, error: null });
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: state.maybeSingle, upsert: state.upsert };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); state.from.mockReturnValue(builder);
});
it.each(["admin", "super_admin"])("%s can review, grant and revoke using the existing audited control", async role => {
  state.role = role;
  expect((await getCommunityRideCreatorAccess(input.userId)).data?.isAllowed).toBe(true);
  expect((await setCommunityRideCreatorAccess(input)).success).toBe(true);
  expect(state.from).toHaveBeenCalledWith("community_ride_creator_grant");
  expect(state.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: input.userId, granted_by_user_id: "staff", revoked_at: null }), { onConflict: "user_id" });
  expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actor_user_id: "staff", related_entity_id: input.riderId, action: "Community ride creator access granted" }));
  expect((await setCommunityRideCreatorAccess({ ...input, allow: false })).success).toBe(true);
  expect(state.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }), expect.anything());
});
it.each(["rider", "support", "moderator", "unknown"])("%s cannot approve a rider through direct actions", async role => {
  state.role = role;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try { expect((await setCommunityRideCreatorAccess(input)).success).toBe(false); expect(state.from).not.toHaveBeenCalled(); }
  finally { error.mockRestore(); }
});
