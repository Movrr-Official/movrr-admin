import { beforeEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
const state = vi.hoisted(() => ({ allowed: true, calls: [] as Array<{ table: string; filters: Record<string, unknown> }>, score: .83 as number | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireCapability: async () => { if (!state.allowed) throw new Error("denied"); } }));
vi.mock("@/lib/userActivity", () => ({ writeUserActivities: vi.fn() }));
vi.mock("@/features/authorization/sodEnforcement", () => ({ enforceApprovalSod: vi.fn(), recordEntityInitiator: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ from: (table: string) => {
 const filters: Record<string, unknown> = {}; state.calls.push({ table, filters });
 const result = () => {
  const rows = table === "rider_route" ? [{ id: "assignment-one", route_id: "shared-route", rider_id: "rider-one" }]
   : table === "ride_session" ? [{ id: "own-session", rider_route_id: "assignment-one", rider_id: "rider-one", compliance_score: state.score }, { id: "foreign-session", rider_route_id: "assignment-two", rider_id: "rider-two", compliance_score: 1 }]
   : [{ id: "own-tracking", route_id: "shared-route", rider_id: "rider-one", path: [] }, { id: "foreign-tracking", route_id: "shared-route", rider_id: "rider-two", path: [{lat:1,lng:2}] }];
  const data = rows.find(row => Object.entries(filters).every(([key,value]) => (row as Record<string,unknown>)[key] === value));
  return {data:data??null,error:data?null:{message:"not found"}};
 };
 const q = { select: () => q, eq: (key:string,value:unknown) => { filters[key]=value;return q; }, order:()=>q,limit:()=>q,single:async()=>result(),maybeSingle:async()=>result() };return q;
} }) }));
import * as routes from "@/app/actions/routes";
beforeEach(() => {state.allowed=true;state.calls=[];state.score=.83});
it("retires the unsafe multi-rider recalculation command completely",()=>expect('recalculateRouteCompliance' in routes).toBe(false));
it("reads only the selected rider assignment's committed compliance",async()=>{const result=await routes.getRouteComplianceBreakdown('assignment-one');expect(result).toMatchObject({success:true,data:{sessionId:'own-session',overallScore:83,waypointCoverage:null}});expect(state.calls.find(c=>c.table==='ride_session')?.filters).toEqual({rider_route_id:'assignment-one',rider_id:'rider-one'})});
it("does not invent a score when no committed score exists",async()=>{state.score=null;expect(await routes.getRouteComplianceBreakdown('assignment-one')).toMatchObject({success:true,data:{overallScore:null}})});
it("does not resolve an unknown assignment through a route-template alias",async()=>{expect(await routes.getRouteComplianceBreakdown('shared-route')).toMatchObject({success:false});expect(state.calls).toHaveLength(1)});
it("stops unauthorized reads before any database access",async()=>{state.allowed=false;expect(await routes.getRouteComplianceBreakdown('assignment-one')).toMatchObject({success:false});expect(state.calls).toHaveLength(0)});
it("keeps SQL operational capabilities derived from the canonical employee templates",()=>{expect(()=>execFileSync(process.execPath,['scripts/generate-alignment-capabilities.cjs','--check'],{stdio:'pipe'})).not.toThrow()});
