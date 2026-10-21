import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { fetchAccountActivityMap } from "@/lib/accountActivity";
const client=(rpc:ReturnType<typeof vi.fn>)=>({rpc}) as unknown as Parameters<typeof fetchAccountActivityMap>[0];
describe("account activity transport",()=>{
 it("uses canonical IDs, paginates, normalizes offsets and preserves null",async()=>{
  const ids=Array.from({length:1001},(_,i)=>`u${i}`);
  const rpc=vi.fn(async(_name,args)=>({data:args.p_users.map((id:string)=>({user_id:id,last_active_at:id==='u0'?"2026-01-01T12:00:00+01:00":null})),error:null}));
  const result=await fetchAccountActivityMap(client(rpc),'reader',ids);
  expect(rpc).toHaveBeenCalledTimes(3);expect(rpc.mock.calls[0][0]).toBe('read_account_activity');
  expect(rpc.mock.calls[0][1].p_actor).toBe('reader');expect(result.size).toBe(1);expect(result.get('u0')).toBe('2026-01-01T11:00:00.000Z');
 });
 it.each([
  {data:null,error:{message:'offline'}},
  {data:[],error:null},
  {data:[{user_id:'other',last_active_at:null}],error:null},
  {data:[{user_id:'u',last_active_at:'invalid'}],error:null},
  {data:[{user_id:'u',last_active_at:'2999-01-01T00:00:00Z'}],error:null},
 ])("rejects unavailable or corrupted projections instead of substituting dates",async response=>{
  await expect(fetchAccountActivityMap(client(vi.fn(async()=>response)),'reader',['u'])).rejects.toThrow();
 });
 it("refreshes every read without retaining another account's data",async()=>{
  let at:string|null=null;
  const rpc=vi.fn(async()=>({data:[{user_id:'u',last_active_at:at}],error:null}));
  expect((await fetchAccountActivityMap(client(rpc),'reader',['u'])).size).toBe(0);
  at='2026-01-01T00:00:00Z';expect((await fetchAccountActivityMap(client(rpc),'reader',['u'])).get('u')).toBe('2026-01-01T00:00:00.000Z');
 });
});
