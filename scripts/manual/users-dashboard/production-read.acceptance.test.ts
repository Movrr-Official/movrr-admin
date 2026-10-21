// Explicit opt-in, read-only production service harness. Not browser/session acceptance.
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({client:null as any,actor:"",authorize:null as any,failUsers:false,requests:[] as {path:string;method:string}[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/admin",()=>({requireCapability:(cap:string)=>state.authorize(cap),requireAnyCapability:()=>{throw new Error("Mutations are forbidden in read-only production acceptance");}}));
vi.mock("@/lib/supabase-admin",()=>({createSupabaseAdminClient:()=>state.client}));
describe.skipIf(process.env.MOVRR_PRODUCTION_USERS_READONLY!=="1")("approved 079 production read-only handler acceptance",()=>{
 let db:ReturnType<typeof postgres>,users:typeof import("@/app/actions/users"),memberships:typeof import("@/app/actions/accountMemberships"),campaigns:typeof import("@/app/actions/campaigns");
 const evidence:any={method:"Actual source handlers and production Supabase GET/read-only RPC; controlled actor boundary validated with read-only SQL, not an authenticated HTTP/browser session",productionWrites:0};
 beforeAll(async()=>{
  const env=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
  expect(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw')).toBe(true);Object.assign(process.env,env);
  db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connection:{default_transaction_read_only:true,application_name:'movrr-users-approved-readonly-acceptance',statement_timeout:30000}});
  state.actor=(await db`SELECT user_id FROM public.admin_users WHERE role='super_admin' AND public.account_identity_active(user_id) ORDER BY user_id LIMIT 1`)[0].user_id;
  state.authorize=async(cap:string)=>{
   const allowed=await db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${state.actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:state.actor,role:'authenticated',aal:'aal2'})},true)`;return (await tx`SELECT public.identity_has_capability(${cap}) allowed`)[0].allowed;});
   if(!allowed)throw new Error('Missing capability: '+cap);return {authUser:{id:state.actor}};
  };
  const readFetch:typeof fetch=async(input,init)=>{
   const url=new URL(String(input)),method=init?.method??'GET';state.requests.push({path:url.pathname,method});
   if(!['GET','HEAD'].includes(method)&&!(method==='POST'&&url.pathname==='/rest/v1/rpc/read_user_auth_sync_pending'))throw new Error('Non-read request blocked: '+method+' '+url.pathname);
   if(state.failUsers&&url.pathname==='/rest/v1/user')return new Response(JSON.stringify({code:'P1_ACCEPTANCE_FAILURE',message:'Controlled read failure'}),{status:503,headers:{'Content-Type':'application/json'}});
   return fetch(input,init);
  };
  state.client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:readFetch}});
  users=await import('@/app/actions/users');memberships=await import('@/app/actions/accountMemberships');campaigns=await import('@/app/actions/campaigns');
 });
 afterAll(async()=>{if(db){evidence.recordedAt=new Date().toISOString();evidence.requestCount=state.requests.length;evidence.privateSyncTableRead=false;writeFileSync('.tmp/users-dashboard-release-20261021/handler-acceptance.json',JSON.stringify(evidence,null,2)+'\n');await db.end({timeout:5});}});
 it('reconciles real authorized DTOs, independent relationships, search and combined filters',async()=>{
  const result=await users.getUsers();expect(result.success).toBe(true);expect(result.warnings).toEqual([]);const rows=result.data!;
  const counts=(await db`SELECT count(*)::int total,count(*) FILTER(WHERE status='active')::int active,(SELECT count(DISTINCT user_id)::int FROM public.rider) riders,(SELECT count(DISTINCT user_id)::int FROM public.organisation_membership WHERE status<>'revoked') organisations,(SELECT count(DISTINCT user_id)::int FROM public.admin_users WHERE role IS NOT NULL) staff FROM public."user"`)[0];
  const actual={total:rows.length,active:rows.filter(u=>u.status==='active').length,riders:rows.filter(u=>u.riderStatus!==undefined).length,organisations:rows.filter(u=>u.memberships?.some(m=>m.status!=='revoked')).length,staff:rows.filter(u=>u.employeeRole).length};expect(actual).toEqual(counts);expect(new Set(rows.map(u=>u.id)).size).toBe(rows.length);
  const sample=rows.find(u=>u.email)!;const searched=await users.getUsers({searchQuery:sample.email});expect(searched.success).toBe(true);expect(searched.data?.some(u=>u.id===sample.id)).toBe(true);
  const riderOnly=rows.filter(u=>u.riderStatus!==undefined&&!u.employeeRole&&!u.memberships?.some(m=>m.status!=='revoked'));const filtered=await users.getUsers({role:'rider',status:'active'});expect(filtered.success).toBe(true);expect(filtered.data?.length).toBe(rows.filter(u=>u.riderStatus!==undefined&&u.status==='active').length);
  const unassigned=await users.getUsers({role:'unassigned'});expect(unassigned.success).toBe(true);expect(unassigned.data?.length).toBe(rows.filter(u=>!u.riderStatus&&!u.employeeRole&&!u.memberships?.some(m=>m.status!=='revoked')).length);
  for(const row of rows)expect(await memberships.getAccountMemberships(row.id)).toEqual(row.memberships??[]);
  const thirty=new Date(Date.now()-30*86400000),sixty=new Date(Date.now()-60*86400000),current=rows.filter(u=>new Date(u.createdAt)>=thirty).length,prior=rows.filter(u=>new Date(u.createdAt)>=sixty&&new Date(u.createdAt)<thirty).length;
  evidence.counts=actual;evidence.growth={current,prior,percent:prior?Math.round((current-prior)/prior*100):current?100:0};evidence.riderOnlyWithoutOrganisation=riderOnly.length;evidence.userOnly=unassigned.data?.length;evidence.searchAndCombinedFilters=true;evidence.membershipReadbackAccounts=rows.length;evidence.noPrivateSyncRead=!state.requests.some(r=>r.path==='/rest/v1/account_auth_sync');
  expect(evidence.noPrivateSyncRead).toBe(true);
 },60_000);
 it('uses the live guarded RPC while denied actors and direct table access stay denied',async()=>{
  const ids=(await db`SELECT id FROM public."user"`).map(r=>r.id),allowed=await state.client.rpc('read_user_auth_sync_pending',{p_actor:state.actor,p_users:ids});expect(allowed.error).toBeNull();expect(Array.isArray(allowed.data)).toBe(true);
  const outsider=(await db`SELECT u.id FROM public."user" u WHERE NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=u.id AND public.ops_employee_capabilities(a.role) ? 'users.read') LIMIT 1`)[0];
  if(outsider){const denied=await state.client.rpc('read_user_auth_sync_pending',{p_actor:outsider.id,p_users:ids});expect(denied.error?.code).toBe('42501');}
  expect((await db`SELECT has_table_privilege('service_role','public.account_auth_sync','SELECT') allowed`)[0].allowed).toBe(false);
  evidence.guardedRpc=true;evidence.deniedActorChecked=!!outsider;evidence.directTableStillDenied=true;
 });
 it('preserves actual MFA and unrelated organisation boundaries in read-only SQL contexts',async()=>{
  for(const aal of ['aal1','aal2'])await db.begin('read only',async tx=>{
   await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${state.actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:state.actor,role:'authenticated',aal})},true)`;
   expect((await tx`SELECT public.identity_has_capability('users.read') allowed`)[0].allowed).toBe(aal==='aal2');
  });
  const external=(await db`SELECT DISTINCT m.user_id FROM public.organisation_membership m WHERE m.status='active' AND NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=m.user_id)`)[0];
  if(external)await db.begin('read only',async tx=>{
   await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${external.user_id},true),set_config('request.jwt.claims',${JSON.stringify({sub:external.user_id,role:'authenticated',aal:'aal2'})},true)`;
   expect((await tx`SELECT public.identity_has_capability('users.read') allowed`)[0].allowed).toBe(false);
   expect((await tx`SELECT public.identity_organisation_capability('00000000-0000-0000-0000-000000000001','staff.manage') allowed`)[0].allowed).toBe(false);
  });evidence.mfaEnforced=true;evidence.externalTenantIsolationChecked=!!external;
 });
 it('keeps Campaigns independent and returns explicit failure without zero User data',async()=>{
  const expectedError=vi.spyOn(console,'error').mockImplementation(()=>{});
  state.failUsers=true;try{const failure=await users.getUsers();expect(failure.success).toBe(false);expect(failure.data).toBeUndefined();expect(failure.error).toContain('Controlled read failure');const result=await campaigns.getCampaigns();expect(result.success).toBe(true);evidence.campaignsIndependent=true;evidence.controlledFailureReturnsNoFabricatedData=true;}finally{state.failUsers=false;expectedError.mockRestore();}
 });
});
