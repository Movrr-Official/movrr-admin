import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({government:false,read:vi.fn()}));
vi.mock("@/features/platform/infrastructure/productionPlatformApi",()=>({productionAuthDeps:{
  verifyAccessToken:async()=>({userId:"user",email:null}),
  findAdminUser:async()=>null,
  findOrganisationMembership:async()=>state.government?{id:"membership",userId:"user",organisationId:"own-org",role:"owner",organisationType:"government"}:null,
  findRiderProfile:async()=>({id:"rider",userId:"user"}),
}}));
vi.mock("@/features/government/application/governmentPlatformService",()=>({getGovernmentProfile:state.read}));
import {GET} from "@/app/api/v1/government/me/route";
beforeEach(()=>{state.government=false;state.read.mockReset().mockResolvedValue({ok:true,value:{organisationId:"own-org"}})});
it("requires bearer authentication and denies riders before accessing organisation data",async()=>{
  expect((await GET(new Request("https://admin.test/api/v1/government/me"))).status).toBe(401);
  expect((await GET(new Request("https://admin.test/api/v1/government/me",{headers:{authorization:"Bearer test"}}))).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled();
});
it("passes the authenticated government organisation scope to the existing profile reader",async()=>{
  state.government=true;
  const response=await GET(new Request("https://admin.test/api/v1/government/me",{headers:{authorization:"Bearer test"}}));
  expect(response.status).toBe(200);
  expect(state.read.mock.calls[0][0].principal).toMatchObject({type:"organisation",organisationId:"own-org",organisationType:"government"});
});
