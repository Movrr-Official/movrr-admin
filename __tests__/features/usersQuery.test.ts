import { beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const state=vi.hoisted(()=>({options:null as any,read:vi.fn(),selected:[] as string[],result:undefined as any}));
vi.mock("react-redux",()=>({useSelector:()=>state.selected}));
vi.mock("@tanstack/react-query",async original=>({...await original<typeof import("@tanstack/react-query")>(),useQuery:(options:any)=>{state.options=options;return {data:state.result};}}));
vi.mock("@/lib/dashboard/readTransport",()=>({dashboardRead:state.read}));
import { useUsersData } from "@/hooks/useUsersData";
beforeEach(()=>{vi.clearAllMocks();state.selected=[];state.result=undefined;});
it("loads Users without calling Campaigns or reading historical user roles",async()=>{
  const user={id:"independent",domains:[],memberships:[]};state.read.mockResolvedValue({success:true,data:[user]});
  useUsersData();expect(await state.options.queryFn()).toEqual({users:[user],warnings:[]});expect(state.read).toHaveBeenCalledExactlyOnceWith("users",undefined,[]);
});
it.each([{success:false,error:"permission denied"},{success:true,data:null}])("does not turn a failed/invalid response into an empty result",async result=>{
  state.read.mockResolvedValue(result);useUsersData();await expect(state.options.queryFn()).rejects.toThrow();
});
it("shares the result, refreshes on invalidation and keeps warnings with actual users",async()=>{
  state.read.mockResolvedValue({success:true,data:[{id:"real"}],warnings:["activity unavailable"]});useUsersData();
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60_000}}});
  const first=await client.fetchQuery(state.options);expect(await client.fetchQuery(state.options)).toEqual(first);expect(state.read).toHaveBeenCalledOnce();
  await client.invalidateQueries({queryKey:["users"]});state.read.mockResolvedValue({success:true,data:[]});
  expect(await client.fetchQuery(state.options)).toEqual({users:[],warnings:[]});expect(state.read).toHaveBeenCalledTimes(2);
  state.result=first;expect(useUsersData()).toMatchObject({data:[{id:"real"}],warnings:["activity unavailable"]});client.clear();
});
