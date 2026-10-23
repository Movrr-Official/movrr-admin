import { beforeEach, expect, it, vi } from "vitest";
import { CANONICAL_EMPLOYEE_ROLES, employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
const state = vi.hoisted(() => ({ role: "operations_manager", rpc: vi.fn(), from: vi.fn(), select: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: vi.fn(async (capability: string) => {
  if (!employeeHasCapability(state.role, capability)) throw new Error("Not authorised");
  return { authUser: { id: "11111111-1111-4111-8111-111111111111" } };
}) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: state.rpc, from: state.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
import { requireCapability } from "@/lib/admin";
import { getCommunitySafetyQueue, moderateCommunityContent } from "@/app/actions/communitySafety";
const input = { operation: "22222222-2222-4222-8222-222222222222", ride: "33333333-3333-4333-8333-333333333333", version: 1, action: "approve" as const, reason: "Reviewed text and image" };
beforeEach(() => {
  vi.clearAllMocks(); state.role = "operations_manager"; state.rpc.mockResolvedValue({ error: null });
  const builder = { select: state.select, eq: vi.fn(), order: vi.fn(), limit: vi.fn(), then: (resolve: (value: { data: never[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })) };
  state.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder); builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder); state.from.mockReturnValue(builder);
});
it.each(CANONICAL_EMPLOYEE_ROLES)("uses the existing capability bundle for review and enforcement: %s", async role => {
  state.role = role;
  if (!employeeHasCapability(role, "community.manage")) {
    await expect(getCommunitySafetyQueue({ status: "open" })).rejects.toThrow("Not authorised");
    await expect(moderateCommunityContent(input)).rejects.toThrow("Not authorised");
    expect(state.from).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  } else {
    expect(await getCommunitySafetyQueue({ status: "open" })).toEqual({ reports: [], pending: [] });
    expect(await moderateCommunityContent(input)).toEqual({ success: true });
    expect(requireCapability).toHaveBeenLastCalledWith("community.manage", { mutation: true });
  }
});
it("does not project reporter identity into the moderation interface", async () => {
  await getCommunitySafetyQueue({ status: "open", reason: "harassment" });
  for (const [selection] of state.select.mock.calls) expect(selection).not.toContain("reporter_user_id");
});
it("binds the actor to the authorised session and performs one atomic command", async () => {
  await moderateCommunityContent(input);
  expect(state.rpc).toHaveBeenCalledOnce();
  expect(state.rpc).toHaveBeenCalledWith("moderate_community_content", expect.objectContaining({ p_actor: "11111111-1111-4111-8111-111111111111", p_operation: input.operation, p_version: 1 }));
  await expect(moderateCommunityContent({ ...input, actor: "spoofed" } as typeof input)).rejects.toThrow();
  expect(state.rpc).toHaveBeenCalledOnce();
});
it("preserves conflict state and never revalidates an unsuccessful decision", async () => {
  state.rpc.mockResolvedValue({ error: { code: "40001" } });
  expect(await moderateCommunityContent(input)).toMatchObject({ success: false, conflict: true });
  expect(state.revalidate).not.toHaveBeenCalled();
});
it("fails safely when the moderation command is unavailable", async () => {
  state.rpc.mockResolvedValue({ error: { code: "57014" } });
  expect(await moderateCommunityContent(input)).toMatchObject({ success: false, conflict: false });
});
