import { beforeEach, describe, expect, it, vi } from "vitest";
import { employeeHasCapability } from "@/features/organisations/domain/employeeRoleTemplates";
import { DASHBOARD_CAPABILITY_SURFACES } from "@/features/authorization/dashboardRegistry";
const state = vi.hoisted(() => ({ role: "engineering_operations", aal: "aal2", actor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", identity: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", authorize: vi.fn(), client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: (...args: unknown[]) => state.authorize(...args) }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: () => state.client() }));
import { proposeHeldRideRecovery, approveHeldRideRecovery, revokeHeldRideRecovery } from "@/app/actions/heldRideRecovery";
const id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
beforeEach(() => {
 vi.clearAllMocks();state.role="engineering_operations";state.aal="aal2";state.identity=state.actor;
 state.authorize.mockImplementation(async(cap:string)=>{if(!employeeHasCapability(state.role,cap))throw Error("Denied");return {authUser:{id:state.actor},adminUser:{role:state.role}};});
 state.rpc.mockResolvedValue({data:id,error:null});
 state.client.mockReturnValue({rpc:state.rpc,auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:state.aal},error:null})},getUser:async()=>({data:{user:{id:state.identity}},error:null})}});
});
describe("one-job recovery capability boundary",()=>{
 it("separates operational request from financial/operations review without root promotion",()=>{
  expect(employeeHasCapability("engineering_operations","rides.settlement.recovery.request")).toBe(true);
  expect(employeeHasCapability("engineering_operations","rides.settlement.recovery.review")).toBe(false);
  for(const role of ["finance_operator","operations_manager"]){expect(employeeHasCapability(role,"rides.settlement.recovery.review")).toBe(true);expect(employeeHasCapability(role,"rides.settlement.recovery.request")).toBe(false);}
  for(const role of ["support_agent","security_admin","campaign_manager","executive_viewer","unknown"])expect(employeeHasCapability(role,"rides.settlement.recovery.review")).toBe(false);
 });
 it("registers same-actor separation and audited single-assignment scope without new navigation",()=>{
  const request=DASHBOARD_CAPABILITY_SURFACES.find(s=>s.capability==="rides.settlement.recovery.request");
  expect(request?.approval).toEqual({initiateCapability:"rides.settlement.recovery.request",approveCapability:"rides.settlement.recovery.review",sodStrict:true});
  expect(request?.auditRequired).toBe(true);expect(request?.navigation).toBeUndefined();
 });
 it("requests with the real authenticated user client and no actor or amount override",async()=>{
  expect(await proposeHeldRideRecovery("Technical cap blocker independently verified","AUTH-ONE-JOB")).toMatchObject({success:true,approvalId:id});
  expect(state.authorize).toHaveBeenCalledWith("rides.settlement.recovery.request",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("propose_held_ride_recovery",{p_reason:"Technical cap blocker independently verified",p_authorization_reference:"AUTH-ONE-JOB"});
 });
 it.each(["finance_operator","operations_manager"])("allows %s to review using the narrow capability",async role=>{
  state.role=role;expect(await approveHeldRideRecovery(id,"INDEPENDENT-REVIEW")).toMatchObject({success:true});
  expect(state.authorize).toHaveBeenCalledWith("rides.settlement.recovery.review",{mutation:true});
  expect(state.rpc).toHaveBeenCalledWith("approve_held_ride_recovery",{p_approval:id,p_review_reference:"INDEPENDENT-REVIEW"});
 });
 it("rejects missing reviewer permissions before making a client",async()=>{
  expect(await approveHeldRideRecovery(id,"INVALID-REVIEW")).toMatchObject({success:false});expect(state.client).not.toHaveBeenCalled();
 });
 it("requires MFA for both request and review",async()=>{
  state.aal="aal1";expect(await proposeHeldRideRecovery("Valid technical reason","AUTH")).toMatchObject({success:false});
  state.role="finance_operator";expect(await approveHeldRideRecovery(id,"REVIEW")).toMatchObject({success:false});expect(state.rpc).not.toHaveBeenCalled();
 });
 it("rejects an identity change between authorization and RPC",async()=>{
  state.identity=id;expect(await proposeHeldRideRecovery("Valid technical reason","AUTH")).toMatchObject({success:false});expect(state.rpc).not.toHaveBeenCalled();
 });
 it("rejects malformed references and opaque approval IDs before any RPC",async()=>{
  expect(await approveHeldRideRecovery("not-a-uuid","REF")).toMatchObject({success:false});expect(await proposeHeldRideRecovery("short","REF")).toMatchObject({success:false});expect(state.rpc).not.toHaveBeenCalled();
 });
 it("revokes through review permission; database approval/evidence failures remain closed",async()=>{
  state.role="finance_operator";expect(await revokeHeldRideRecovery(id,"Authorization withdrawn before claim")).toMatchObject({success:true});
  expect(state.rpc).toHaveBeenCalledWith("revoke_held_ride_recovery",{p_approval:id,p_reason:"Authorization withdrawn before claim"});
  state.rpc.mockResolvedValue({data:null,error:{message:"private synthetic failure"}});
  const result=await approveHeldRideRecovery(id,"REVIEW");expect(result).toMatchObject({success:false});expect(JSON.stringify(result)).not.toContain("private synthetic");
 });
});
