import { beforeEach, describe, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
const state=vi.hoisted(()=>({role:"support_agent",authorize:vi.fn(),client:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/admin",()=>({requireCapability:(...args:unknown[])=>state.authorize(...args)}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>state.client()}));
import { executeAccountDeletionFinancialResolution } from "@/app/actions/accountDeletionFinance";
import { executeAccountDeletionEquipmentReturn } from "@/app/actions/accountDeletionEquipment";
import { executeAccountDeletionContinuity, executeAccountDeletionBusinessContinuity } from "@/app/actions/accountDeletionContinuity";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(()=>{vi.clearAllMocks();state.role="support_agent";state.authorize.mockImplementation(async(cap:string)=>{
 if(!employeeHasCapability(state.role,cap))throw new Error("Denied");return{authUser:{id}};
});state.client.mockReturnValue({rpc:state.rpc});});
describe("Deletion executable obligation capabilities",()=>{
 it("denies Support and Finance business transfer and export stopping before privileged access",async()=>{
  for(const role of ["support_agent","finance_operator"]){state.role=role;expect((await executeAccountDeletionBusinessContinuity(id,id,"advertiser_transfer",id)).success).toBe(false);expect((await executeAccountDeletionBusinessContinuity(id,id,"export_stop")).success).toBe(false);}
  expect(state.client).not.toHaveBeenCalled();
 });
 it("keeps Operations business continuity server-authoritative and rejects invalid successor IDs",async()=>{
  state.role="operations_manager";expect((await executeAccountDeletionBusinessContinuity(id,id,"advertiser_transfer","invalid")).success).toBe(false);expect(state.client).not.toHaveBeenCalled();
  state.rpc.mockResolvedValue({data:{state:"review"},error:null});expect((await executeAccountDeletionBusinessContinuity(id,id,"advertiser_transfer",id)).success).toBe(false);
  expect(state.rpc).toHaveBeenLastCalledWith("execute_account_deletion_advertiser_transfer",{p_proposal:id,p_actor:id,p_advertiser:id,p_successor:id});
  state.rpc.mockResolvedValue({data:{state:"confirmed"},error:null});expect((await executeAccountDeletionBusinessContinuity(id,id,"export_stop")).success).toBe(true);
  expect(state.rpc).toHaveBeenLastCalledWith("execute_account_deletion_export_stop",{p_proposal:id,p_actor:id,p_export:id});
 });
 it("rejects Support and Finance continuity execution before privileged access",async()=>{
  for(const role of ["support_agent","finance_operator"]){state.role=role;expect((await executeAccountDeletionContinuity(id,id,"community_transfer")).success).toBe(false);}
  expect(state.client).not.toHaveBeenCalled();
 });
 it("uses Operations capability and preserves backend policy/independent-review gates",async()=>{
  state.role="operations_manager";state.rpc.mockResolvedValue({data:{state:"review"},error:null});
  expect((await executeAccountDeletionContinuity(id,id,"organisation_detach")).success).toBe(false);
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.operations.review",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("execute_account_deletion_continuity",{p_proposal:id,p_actor:id,p_kind:"organisation_detach",p_source:id});
 });
 it("rejects Support financial and equipment execution before constructing a privileged client",async()=>{
  expect((await executeAccountDeletionFinancialResolution(id,id,"verified_refund")).success).toBe(false);
  expect((await executeAccountDeletionEquipmentReturn(id,id,id)).success).toBe(false);
  expect(state.client).not.toHaveBeenCalled();
 });
 it("separates Finance from Operations proof execution",async()=>{
  state.role="finance_operator";expect((await executeAccountDeletionEquipmentReturn(id,id,id)).success).toBe(false);
  expect(state.client).not.toHaveBeenCalled();
 });
 it("keeps unapproved Finance decisions in review without exposing diagnostics",async()=>{
  state.role="finance_operator";state.rpc.mockResolvedValue({data:{state:"review"},error:null});
  const result=await executeAccountDeletionFinancialResolution(id,id,"verified_refund");expect(result.success).toBe(false);
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.finance.review",{mutation:true});
  expect(state.rpc).toHaveBeenCalledTimes(1);
 });
 it("uses the canonical fulfilment state machine for a committed refund timeline",async()=>{
  state.role="finance_operator";
  state.rpc.mockImplementation(async(name:string)=>({data:name==="execute_account_deletion_financial_resolution"?{state:"confirmed",obligationResolved:false}:name==="get_account_deletion_refund_timeline"?{
   id,redemptionId:id,riderId:id,catalogItemId:id,fulfilmentType:"instant_digital",state:"cancelled",version:0,idempotencyKey:id,metadata:{},events:[],outcome:"cancelled"
  }:{state:"confirmed",obligationResolved:true},error:null}));
  expect((await executeAccountDeletionFinancialResolution(id,id,"verified_refund")).success).toBe(true);
  expect(state.rpc).toHaveBeenLastCalledWith("commit_account_deletion_refund_timeline",expect.objectContaining({p_case:id,p_proposal:id,p_actor:id,p_from:"cancelled",p_version:0,p_event:expect.any(String)}));
 });
 it("does not invent a refund edge for unsupported fulfilment types",async()=>{
  state.role="finance_operator";state.rpc.mockImplementation(async(name:string)=>({data:name==="execute_account_deletion_financial_resolution"?{state:"confirmed",obligationResolved:false}:{id,redemptionId:id,riderId:id,catalogItemId:id,fulfilmentType:"physical_shipping",state:"cancelled",version:0,idempotencyKey:id,metadata:{},events:[],outcome:"cancelled"},error:null}));
  expect((await executeAccountDeletionFinancialResolution(id,id,"verified_refund")).success).toBe(false);
  expect(state.rpc).toHaveBeenCalledTimes(2);
 });
 it("requires confirmed equipment proof and returns no retained evidence",async()=>{
  state.authorize.mockResolvedValue({authUser:{id}});state.rpc.mockResolvedValue({data:{state:"confirmed",obligationResolved:true},error:null});
  expect(await executeAccountDeletionEquipmentReturn(id,id,id)).toEqual({success:true});
  expect(state.authorize).toHaveBeenCalledWith("privacy.deletion.operations.review",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("execute_account_deletion_equipment_resolution",{p_case:id,p_proposal:id,p_actor:id,p_proof:id});
 });
});
