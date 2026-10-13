import { beforeEach, describe, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
import { ACCOUNT_DELETION_STATUSES, isAccountDeletionReceipt } from "@/lib/accountDeletionContract";
const state = vi.hoisted(() => ({ role: "support_agent", authorize: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: (...args: unknown[]) => state.authorize(...args) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => state.client() }));
import { getAccountDeletionMonitor, escalateAccountDeletion, getAccountDeletionReview, proposeAccountDeletionReview, reviewAccountDeletionProposal, resolveAccountDeletionCase } from "@/app/actions/accountDeletion";
import { getAccountDeletionCampaignReport } from "@/app/actions/accountDeletion";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  vi.clearAllMocks(); state.role = "support_agent";
  state.authorize.mockImplementation(async (cap: string) => {
    if (!employeeHasCapability(state.role, cap)) throw new Error("Denied");
    return { authUser: { id }, adminUser: { role: state.role } };
  });
  state.rpc.mockResolvedValue({ data: [], error: null });
  state.client.mockReturnValue({ rpc: state.rpc });
});
describe("Deletion operational capability boundaries", () => {
  it("rejects Support and Finance campaign evidence reads before privileged client creation", async () => {
    for (const role of ["support_agent", "finance_operator"]) {
      state.role = role;
      expect((await getAccountDeletionCampaignReport(id, id)).success).toBe(false);
    }
    expect(state.client).not.toHaveBeenCalled();
  });
  it("allows Compliance only minimal job-scoped aggregate output and strips unexpected evidence", async () => {
    state.role = "compliance_analyst";
    state.rpc.mockResolvedValue({data:{contractVersion:1,state:"confirmed",email:"must-not-leak",totals:{total_impressions:2,verified_impressions:2,impressions_earned:20,total_distance_km:10,total_points_awarded:75,riderId:id}},error:null});
    const result = await getAccountDeletionCampaignReport(id, id);
    expect(result).toEqual({success:true,data:{state:"confirmed",totals:{total_impressions:2,verified_impressions:2,impressions_earned:20,total_distance_km:10,total_points_awarded:75}}});
    expect(state.rpc).toHaveBeenCalledWith("account_deletion_campaign_review",{p_job:id,p_campaign:id,p_actor:id});
  });
  it("rejects Support case resolution before creating a privileged client", async () => {
    expect((await resolveAccountDeletionCase(id, id, "finance", id)).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("uses Finance authorization and opaque operation IDs for guarded resolution", async () => {
    state.role = "finance_operator";
    state.rpc.mockResolvedValue({ data: { state: "resolved" }, error: null });
    expect((await resolveAccountDeletionCase(id, id, "finance", id)).success).toBe(true);
    expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.finance.review", { mutation: true });
    expect(state.rpc).toHaveBeenCalledWith("resolve_account_deletion_case", { p_case: id, p_proposal: id, p_actor: id, p_category: "finance", p_operation: id });
  });
  it("rejects unconfirmed results, cross-department access and raw operation keys", async () => {
    state.role = "finance_operator";
    expect((await resolveAccountDeletionCase(id, id, "operations", id)).success).toBe(false);
    expect((await resolveAccountDeletionCase(id, id, "finance", "wallet.close:rider:v1")).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: { state: "prepared" }, error: null });
    expect((await resolveAccountDeletionCase(id, id, "finance", id)).success).toBe(false);
  });
  it.each(["unknown", "rider", "executive_viewer"])("rejects %s before creating a privileged client", async role => {
    state.role = role;
    expect((await getAccountDeletionMonitor()).success).toBe(false);
    expect((await escalateAccountDeletion(id)).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("lets Support monitor safe metadata and escalate without retention, finance or recovery authority", async () => {
    expect((await getAccountDeletionMonitor()).success).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("account_deletion_monitor", { p_actor_user_id: id });
    for (const cap of ["privacy.deletion.finance.review", "privacy.deletion.compliance.review", "privacy.deletion.recovery", "privacy.erase"])
      expect(employeeHasCapability("support_agent", cap)).toBe(false);
    state.rpc.mockResolvedValue({ data: true, error: null });
    expect((await escalateAccountDeletion(id)).success).toBe(true);
    expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.escalate", { mutation: true });
    expect(state.rpc).toHaveBeenLastCalledWith("escalate_account_deletion", { p_job_id: id, p_actor_user_id: id });
  });
  it("separates finance and compliance capabilities", () => {
    expect(employeeHasCapability("finance_operator", "privacy.deletion.finance.review")).toBe(true);
    expect(employeeHasCapability("finance_operator", "privacy.deletion.compliance.review")).toBe(false);
    expect(employeeHasCapability("finance_operator", "privacy.deletion.recovery")).toBe(false);
    expect(employeeHasCapability("compliance_analyst", "privacy.deletion.compliance.review")).toBe(true);
    expect(employeeHasCapability("compliance_analyst", "privacy.deletion.finance.review")).toBe(false);
  });
  it("rejects invalid request IDs before privileged RPC calls", async () => {
    expect((await escalateAccountDeletion("invalid")).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("fails closed when audit-backed monitoring fails", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "internal secret" } });
    const result = await getAccountDeletionMonitor();
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("internal secret");
  });
  it("rejects Support review and proposal access before constructing the privileged client", async () => {
    expect((await getAccountDeletionReview(id, "finance")).success).toBe(false);
    expect((await proposeAccountDeletionReview(id, "recovery", "confirm_invocation_terminated", "INC-123")).success).toBe(false);
    expect((await reviewAccountDeletionProposal(id, "compliance", "approved")).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("lets Finance submit only server-authorized category review calls", async () => {
    state.role = "finance_operator";
    expect((await getAccountDeletionReview(id, "finance")).success).toBe(true);
    expect(state.rpc).toHaveBeenLastCalledWith("account_deletion_review_cases", { p_job_id: id, p_actor: id, p_category: "finance" });
    expect((await proposeAccountDeletionReview(id, "finance", "resolve_obligation", "FIN-123")).success).toBe(true);
    expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.finance.review", { mutation: true });
    expect((await getAccountDeletionReview(id, "compliance")).success).toBe(false);
  });
  it("rejects unknown categories and PII-bearing approval references before RPCs", async () => {
    state.role = "finance_operator";
    expect((await getAccountDeletionReview(id, "unknown" as "finance")).success).toBe(false);
    expect((await proposeAccountDeletionReview(id, "finance", "resolve_obligation", "person@example.invalid")).success).toBe(false);
    expect(state.client).not.toHaveBeenCalled();
  });
  it("leaves self-review enforcement to the audited SQL contract and hides database errors", async () => {
    state.role = "finance_operator";
    state.rpc.mockResolvedValue({ data: null, error: { message: "internal private evidence" } });
    const result = await reviewAccountDeletionProposal(id, "finance", "approved");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("internal private evidence");
  });
  it.each(ACCOUNT_DELETION_STATUSES)("understands shared status %s only with a versioned receipt", status => {
    expect(isAccountDeletionReceipt({ requestId: id, status, policyVersion: 1, contractVersion: 1 })).toBe(true);
    expect(isAccountDeletionReceipt({ requestId: id, status, policyVersion: 1, contractVersion: 2 })).toBe(false);
  });
});

it("restricts destructive case activation proposals to Security recovery capability", async () => {
  for (const role of ["support_agent", "finance_operator", "operations_coordinator", "compliance_analyst"]) {
    state.role = role;
    expect((await proposeAccountDeletionReview(id, "recovery", "activate_destructive_processing", "policy:1")).success).toBe(false);
  }
  expect(state.client).not.toHaveBeenCalled();
  state.role = "security_admin";
  expect((await proposeAccountDeletionReview(id, "recovery", "activate_destructive_processing", "policy:1")).success).toBe(true);
  expect(state.rpc).toHaveBeenCalledWith("propose_account_deletion_review", {p_job_id:id,p_actor:id,p_category:"recovery",p_action:"activate_destructive_processing",p_reference:"policy:1"});
});
