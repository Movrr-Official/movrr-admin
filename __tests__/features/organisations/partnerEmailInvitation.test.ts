import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({principal:{type:"organisation",userId:"actor",organisationId:"00000000-0000-4000-8000-000000000001"},rpc:vi.fn(),from:vi.fn(),lookup:vi.fn(),auth:vi.fn(),route:vi.fn()}));
vi.mock("@/lib/env",()=>({CUSTOMER_APP_URL:"https://workspace.invalid"}));
vi.mock("@/features/platform/infrastructure/productionPlatformApi",()=>({productionAuthDeps:{}}));
vi.mock("@/lib/http/platformRoute",()=>({platformRoute:async(options:any)=>{state.route(options.capability);return Response.json(await options.handle({principal:state.principal},options.request));}}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>({rpc:state.rpc,from:state.from,auth:{admin:{getUserById:state.auth}}})}));
import { POST } from "@/app/api/v1/organisations/[id]/invitations/route";
const org="00000000-0000-4000-8000-000000000001",user="00000000-0000-4000-8000-000000000002";
const send=async(body:unknown,id=org)=>(await POST(new Request("https://api.invalid/",{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id})})).json();
beforeEach(()=>{vi.clearAllMocks();state.principal.organisationId=org;state.lookup.mockResolvedValue({data:{id:user},error:null});state.from.mockReturnValue({select:()=>({eq:state.lookup})});state.lookup.mockReturnValue({maybeSingle:async()=>({data:{id:user},error:null})});state.auth.mockResolvedValue({data:{user:{email:"staff@example.com"}},error:null});state.rpc.mockResolvedValue({data:{id:"invitation"},error:null});});
it("resolves an exact email after tenant checks and delegates membership authority to the invitation RPC",async()=>{
  const result=await send({email:" STAFF@example.com ",role:"staff",operationToken:"a".repeat(64)});expect(result.ok).toBe(true);expect(state.route).toHaveBeenCalledWith("staff.manage");expect(state.lookup).toHaveBeenCalledWith("email","staff@example.com");expect(state.rpc).toHaveBeenCalledWith("issue_organisation_invitation",expect.objectContaining({p_actor:"actor",p_user:user,p_organisation:org,p_role:"staff"}));
});
it("denies cross-tenant invitations before identity lookup",async()=>{
  const result=await send({email:"staff@example.com",role:"staff",operationToken:"a".repeat(64)},user);expect(result.ok).toBe(false);expect(state.from).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();
});
it("denies ambiguous recipient fields and mismatched Auth identity",async()=>{
  expect((await send({email:"staff@example.com",userId:user,role:"staff",operationToken:"a".repeat(64)})).ok).toBe(false);expect(state.from).not.toHaveBeenCalled();
  state.auth.mockResolvedValue({data:{user:{email:"other@example.com"}},error:null});expect((await send({email:"staff@example.com",role:"staff",operationToken:"a".repeat(64)})).ok).toBe(false);expect(state.rpc).not.toHaveBeenCalled();
});
it("keeps the existing Admin user-id invitation contract",async()=>{
  expect((await send({userId:user,role:"staff",operationToken:"b".repeat(64)})).ok).toBe(true);expect(state.from).not.toHaveBeenCalled();expect(state.rpc).toHaveBeenCalledWith("issue_organisation_invitation",expect.objectContaining({p_user:user}));
});
