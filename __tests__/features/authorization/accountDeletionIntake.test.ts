import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: mocks.authorize }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.client }));
import { changeDeletionIntake, getDeletionIntakeControl } from "@/app/actions/accountDeletionIntake";
const operation = "11111111-1111-4111-8111-111111111111";
const command = { accountId: operation, state: "hold" as const, expectedVersion: 2, reason: "Operational incident review", operation };
const status = { state: "hold", version: 3, changedAt: "2026-10-20T10:00:00Z", changedBy: operation, reason: command.reason, requestsEnabled: false, policyVersion: 1 };
beforeEach(() => { vi.resetAllMocks(); mocks.authorize.mockResolvedValue({ authUser: { id: operation } }); mocks.client.mockResolvedValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: status, error: null }); });
describe("Deletion intake action boundary", () => {
  it("requires security mutation authorization and passes the current session, no supplied actor", async () => {
    expect((await changeDeletionIntake(command)).data).toEqual(status);
    expect(mocks.authorize).toHaveBeenCalledWith("settings.security", { mutation: true });
    expect(mocks.rpc).toHaveBeenCalledWith("set_account_deletion_intake", { p_state: "hold", p_expected: 2, p_reason: command.reason, p_operation: operation });
  });
  it("denies before database access", async () => {
    mocks.authorize.mockRejectedValue(new Error("Denied"));
    expect((await changeDeletionIntake(command)).error).toBeTruthy();
    expect((await getDeletionIntakeControl()).error).toBeTruthy();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects an account switch without sending the pending command", async () => {
    mocks.authorize.mockResolvedValue({ authUser: { id: "22222222-2222-4222-8222-222222222222" } });
    expect((await changeDeletionIntake(command)).error).toContain("Account changed");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([{ ...command, reason: "" }, { ...command, operation: "invalid" }, { ...command, expectedVersion: -1 }, { ...command, actor: operation }])("rejects invalid or forged commands", async input => {
    expect((await changeDeletionIntake(input)).error).toBeTruthy(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["40001", "55000", "42501"])("reports %s as unconfirmed without retrying a different command", async code => {
    mocks.rpc.mockResolvedValue({ error: { code }, data: null });
    expect((await changeDeletionIntake(command)).error).toBeTruthy(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails closed on missing, unsupported or unavailable status", async () => {
    for (const data of [null, {}, { ...status, state: "unknown" }]) {
      mocks.rpc.mockResolvedValue({ data, error: null }); expect((await getDeletionIntakeControl()).error).toBeTruthy();
    }
  });
  it("reports intake-specific readiness without requiring execution approval", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "55000" }, data: null });
    expect((await changeDeletionIntake(command)).error).toBe("The intake contract and approved receipt access are required. Intake was not enabled.");
  });
});
