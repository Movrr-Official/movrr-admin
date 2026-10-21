import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),capability:vi.fn(),anyCapability:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin",()=>({requireCapability:(...a:unknown[])=>state.capability(...a),requireAnyCapability:(...a:unknown[])=>state.anyCapability(...a)}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>({rpc:state.rpc,from:state.from})}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/userActivity",()=>({writeUserActivity:vi.fn(async()=>{}),fetchUserActivityFeed:vi.fn()}));
vi.mock("@/lib/platformSettings",()=>({}));
vi.mock("@/lib/env",()=>({APP_URL:"https://example.test",FROM_EMAIL:"test@example.test",RESEND_API_KEY:""}));
import {updateUser} from "@/app/actions/users";
beforeEach(()=>{vi.clearAllMocks();state.capability.mockResolvedValue({authUser:{id:"operator"}});state.anyCapability.mockResolvedValue({authUser:{id:"operator"}});state.rpc.mockResolvedValue({error:null});});
describe("canonical User Details employee commands",()=>{
 it("passes employee membership and profile through one atomic PostgreSQL contract",async()=>{
   expect((await updateUser({id:"rider",name:"Existing Rider",employeeRole:"partner_operations_manager"})).success).toBe(true);
   expect(state.rpc).toHaveBeenCalledExactlyOnceWith("update_admin_user_profile",expect.objectContaining({p_actor:"operator",p_user:"rider",p_patch:expect.objectContaining({name:"Existing Rider",employee_role:"partner_operations_manager"})}));
   expect(state.rpc.mock.calls[0][1]).not.toHaveProperty("p_role");expect(state.from).not.toHaveBeenCalled();
 });
 it.each(["admin","moderator","support","rider","advertiser"])("rejects obsolete profile role input %s without a write",async role=>{
   expect((await updateUser({id:"rider",name:"No conversion",role} as never)).success).toBe(false);
   expect(state.rpc).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled();
 });
 it("revokes only the employee grant through the profile membership command",async()=>{
   expect((await updateUser({id:"rider",employeeRole:null,expectedEmployeeRole:"partner_operations_manager",expectedUpdatedAt:"2026-10-21T00:00:00Z"})).success).toBe(true);
   expect(state.rpc).toHaveBeenCalledWith("update_admin_user_profile",expect.objectContaining({p_patch:expect.objectContaining({employee_role:null,expected_employee_role:"partner_operations_manager"})}));
 });
 it("reports an atomic profile/assignment failure truthfully",async()=>{
   state.rpc.mockResolvedValue({error:{message:"Unauthorized employee role assignment"}});
   expect(await updateUser({id:"rider",name:"Must rollback",employeeRole:"super_admin"})).toEqual({success:false,error:"Unauthorized employee role assignment"});
   expect(state.from).not.toHaveBeenCalled();
 });
});
