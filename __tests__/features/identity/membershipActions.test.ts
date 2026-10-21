import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({authorize:vi.fn(),rpc:vi.fn(),invalidate:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin",()=>({requireCapability:state.authorize,requireAnyCapability:state.authorize}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>({rpc:state.rpc})}));
vi.mock("@/lib/env",()=>({CUSTOMER_APP_URL:"https://app.example.test"}));
vi.mock("next/cache",()=>({revalidatePath:state.invalidate}));
import { changeAccountMembership } from "@/app/actions/accountMemberships";
const id="11111111-1111-4111-8111-111111111111",org="22222222-2222-4222-8222-222222222222",actor="33333333-3333-4333-8333-333333333333";
const input={userId:id,organisationId:org,role:"staff" as const,status:"revoked" as const,expectedUpdatedAt:"2026-10-21T15:00:00.987654+00:00"};
beforeEach(()=>{vi.clearAllMocks();state.authorize.mockResolvedValue({authUser:{id:actor}});state.invalidate.mockImplementation(()=>{});state.rpc.mockResolvedValue({data:{id:actor,user_id:id,organisation_id:org,role:"staff",status:"revoked",updated_at:"2026-10-21T15:01:00.123456+00:00"},error:null});vi.spyOn(console,"error").mockImplementation(()=>{});});
describe("membership Server Action serializable contract",()=>{
  it("calls only the canonical writer and preserves exact scope and timestamp precision",async()=>{
    const result=await changeAccountMembership(input);expect(result.success).toBe(true);expect(state.rpc).toHaveBeenCalledExactlyOnceWith("change_organisation_membership",{p_actor:actor,p_user:id,p_organisation:org,p_role:"staff",p_status:"revoked",p_expected:input.expectedUpdatedAt});expect(state.invalidate).toHaveBeenCalledWith("/users");
  });
  it.each([['P0001','Cannot remove last active organisation owner','last_owner'],['40001','Stale membership command; reload before changing access','conflict'],['42501','Unauthorized membership change','denied']])("returns %s/%s as a meaningful value instead of an RSC exception",async(code,message,expected)=>{
    state.rpc.mockResolvedValue({data:null,error:{code,message}});const result=await changeAccountMembership(input);expect(result).toMatchObject({success:false,error:{code:expected,message:expect.any(String)}});expect(JSON.parse(JSON.stringify(result))).toEqual(result);expect(state.invalidate).not.toHaveBeenCalled();
  });
  it.each(['MFA_REQUIRED','NOT_AUTHORIZED','SESSION_EXPIRED'])("denies %s before reaching the writer",async code=>{
    state.authorize.mockRejectedValue(Object.assign(new Error("Your Admin session cannot change this access"),{code}));expect(await changeAccountMembership(input)).toMatchObject({success:false,error:{code:"denied",message:expect.stringContaining("Admin session")}});expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid identities/roles before any writer side effect",async()=>{
    expect(await changeAccountMembership({...input,role:"super_admin" as never})).toMatchObject({success:false,error:{code:"invalid"}});expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not label an empty or mismatched RPC response successful",async()=>{
    state.rpc.mockResolvedValue({data:null,error:null});expect(await changeAccountMembership(input)).toMatchObject({success:false,error:{code:"unavailable"}});expect(console.error).toHaveBeenCalled();
  });
  it("reports a committed mutation truthfully when cache invalidation fails",async()=>{
    state.invalidate.mockImplementation(()=>{throw new Error("Cache unavailable")});expect(await changeAccountMembership(input)).toMatchObject({success:true,warning:expect.stringContaining("saved")});expect(state.rpc).toHaveBeenCalledOnce();expect(console.error).toHaveBeenCalled();
  });
  it("logs unexpected failures without serializing database internals to the browser",async()=>{
    state.rpc.mockRejectedValue(new Error("private infrastructure diagnostic"));const result=await changeAccountMembership(input);expect(result).toMatchObject({success:false,error:{code:"unavailable"}});expect(JSON.stringify(result)).not.toContain("private infrastructure");expect(console.error).toHaveBeenCalled();
  });
  it("preserves Next framework redirects",async()=>{
    const redirect=Object.assign(new Error("redirect"),{digest:"NEXT_REDIRECT;replace;/auth/signin;307;"});state.authorize.mockRejectedValue(redirect);await expect(changeAccountMembership(input)).rejects.toBe(redirect);
  });
});
