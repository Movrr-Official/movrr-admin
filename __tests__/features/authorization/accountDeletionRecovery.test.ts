import { beforeEach, describe, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
const state = vi.hoisted(() => ({ role: "support_agent", authorize: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: (...args: unknown[]) => state.authorize(...args) }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => state.client() }));
import { exportAccountDeletionSuppression, importAccountDeletionSuppression, prepareAccountDeletionRestoreRecovery, startAccountDeletionRestoreRecovery, verifyAccountDeletionRestoreQuarantine, authorizeAccountDeletionRestoreReactivation } from "@/app/actions/accountDeletionRecovery";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", artifact={manifest:{contractVersion:1},signature:"a".repeat(64)};
beforeEach(()=>{
 vi.clearAllMocks();state.role="support_agent";
 state.authorize.mockImplementation(async(cap:string)=>{
  if(!employeeHasCapability(state.role,cap))throw new Error("Denied");
  return {authUser:{id}};
 });
 state.client.mockReturnValue({rpc:state.rpc});state.rpc.mockResolvedValue({data:{state:"confirmed"},error:null});
});
describe("Quarantined restored-subject recovery",()=>{
 it.each(["support_agent","finance_operator","compliance_analyst","operations_coordinator"])("denies %s every restore action before privileged access",async role=>{
  state.role=role;
  for(const operation of [()=>prepareAccountDeletionRestoreRecovery(id,artifact),()=>startAccountDeletionRestoreRecovery(id,id),()=>verifyAccountDeletionRestoreQuarantine(id),()=>authorizeAccountDeletionRestoreReactivation(id,id)])expect((await operation()).success).toBe(false);
  expect(state.client).not.toHaveBeenCalled();
 });
 it("binds signed restored identity preparation to the existing Security capability",async()=>{
  state.role="security_admin";state.rpc.mockResolvedValue({data:{state:"quarantined",requestId:id,manifest:{sensitive:true}},error:null});
  expect(await prepareAccountDeletionRestoreRecovery(id,artifact)).toEqual({success:true,data:{state:"quarantined",requestId:id}});
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.recovery",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("prepare_account_deletion_restore_recovery",{p_user:id,p_actor:id,p_manifest:artifact.manifest,p_signature:artifact.signature});
 });
 it("queues through independent backend review without exposing a claim token",async()=>{
  state.role="security_admin";state.rpc.mockResolvedValue({data:{state:"queued",leaseToken:"never-expose"},error:null});
  expect(await startAccountDeletionRestoreRecovery(id,id)).toEqual({success:true,data:{state:"queued",requestId:id}});
  expect(state.rpc).toHaveBeenCalledWith("start_account_deletion_restore_recovery",{p_job:id,p_actor:id,p_proposal:id});
 });
 it("requires verified residuals and distinct reactivation authorization",async()=>{
  state.role="security_admin";state.rpc.mockResolvedValue({data:{state:"quarantined",residuals:["private"]},error:null});
  expect((await verifyAccountDeletionRestoreQuarantine(id)).success).toBe(false);
  expect((await authorizeAccountDeletionRestoreReactivation(id,id)).success).toBe(false);
  state.rpc.mockResolvedValue({data:{state:"verified",residuals:["never-expose"]},error:null});
  expect(await verifyAccountDeletionRestoreQuarantine(id)).toEqual({success:true,data:{state:"verified",requestId:id}});
  state.rpc.mockResolvedValue({data:{state:"authorized"},error:null});
  expect((await authorizeAccountDeletionRestoreReactivation(id,id)).success).toBe(true);
 });
});
describe("Deletion restoration capability and proof gates",()=>{
 it.each(["support_agent","finance_operator","compliance_analyst","operations_coordinator"])("rejects %s before privileged access",async role=>{
  state.role=role;expect((await exportAccountDeletionSuppression(id)).success).toBe(false);
  expect((await importAccountDeletionSuppression(id,id,artifact)).success).toBe(false);
  expect(state.client).not.toHaveBeenCalled();
 });
 it("uses Security Administration capability for a signed export",async()=>{
  state.role="security_admin";expect((await exportAccountDeletionSuppression(id)).success).toBe(true);
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.recovery");
  expect(state.rpc).toHaveBeenCalledWith("export_account_deletion_suppression_manifest",{p_job:id,p_actor:id});
 });
 it("requires mutation authorization and server-side independent review",async()=>{
  state.role="security_admin";expect((await importAccountDeletionSuppression(id,id,artifact)).success).toBe(true);
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.recovery",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("import_account_deletion_suppression_manifest",{p_job:id,p_proposal:id,p_actor:id,p_manifest:artifact.manifest,p_signature:artifact.signature});
 });
 it("rejects malformed proofs and uncertain SQL results without leaking diagnostics",async()=>{
  state.role="security_admin";expect((await importAccountDeletionSuppression(id,id,{manifest:{},signature:"secret"})).success).toBe(false);
  expect(state.client).not.toHaveBeenCalled();
  state.rpc.mockResolvedValue({data:null,error:{message:"SYNTHETIC SECRET"}});
  const result=await importAccountDeletionSuppression(id,id,artifact);expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC SECRET");
 });
});
