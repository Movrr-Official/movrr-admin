// Explicitly read-only production acceptance of the approved source handlers and
// adapters. Controlled actor/token-verification ports are not real browser login.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync,writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { createTable,getCoreRowModel,getSortedRowModel,getPaginationRowModel } from '@tanstack/react-table';
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({client:null as any,actor:'',authorize:null as any,requests:[] as {path:string,method:string}[]}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/admin',()=>({requireCapability:(cap:string)=>state.authorize(cap),requireAnyCapability:()=>{throw Error('Mutation forbidden');}}));
vi.mock('@/lib/supabase-admin',()=>({createSupabaseAdminClient:()=>state.client}));
describe.skipIf(process.env.MOVRR_PRODUCTION_RIDER_ACTIVITY_READONLY!=='1')('approved Partner correction: production read-only acceptance',()=>{
 let db:ReturnType<typeof postgres>,users:typeof import('@/app/actions/users');
 const uid='007b5ab8-fea0-41f2-9068-055f154d7db0',org='17be1d12-9e61-4654-afd0-fad0bf2d0278';
 const evidence:any={method:'Actual approved source handlers/adapters against production GET and read-only RPC, with controlled actor/token verification ports; no production authenticated browser session or account login fabricated',productionWrites:0};
 beforeAll(async()=>{
  vi.stubGlobal('React',React);
  const env=Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
  Object.assign(process.env,env);expect(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw')).toBe(true);
  db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connection:{default_transaction_read_only:true,statement_timeout:30000}});
  state.actor=(await db`select user_id from public.admin_users where role='super_admin' and public.account_identity_active(user_id) limit 1`)[0].user_id;
  state.authorize=async(cap:string)=>{
   const allowed=await db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`select set_config('request.jwt.claim.sub',${state.actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:state.actor,role:'authenticated',aal:'aal2'})},true)`;return(await tx`select public.identity_has_capability(${cap}) allowed`)[0].allowed;});
   if(!allowed)throw Error('Missing capability: '+cap);return{authUser:{id:state.actor}};
  };
  const readFetch:typeof fetch=async(input,init)=>{
   const url=new URL(String(input)),method=init?.method??'GET';state.requests.push({path:url.pathname,method});
   if(!['GET','HEAD'].includes(method)&&!(method==='POST'&&['/rest/v1/rpc/read_account_activity','/rest/v1/rpc/read_user_auth_sync_pending'].includes(url.pathname)))throw Error('Non-read production request blocked');
   return fetch(input,init);
  };
  state.client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:readFetch}});
  users=await import('@/app/actions/users');
 });
 afterAll(async()=>{if(db){evidence.recordedAt=new Date().toISOString();evidence.requests=state.requests;writeFileSync('docs/verification/rider-identity-activity/handler-production.json',JSON.stringify(evidence,null,2)+'\n');await db.end();}vi.unstubAllGlobals();});
 it('projects Partner, Powerdon and Owner without Rider; filters/counts use actual relationships',async()=>{
  const result=await users.getUsers();expect(result.success).toBe(true);expect(result.warnings).toEqual([]);
  const target=result.data!.find(u=>u.id===uid)!;expect(target.domains).toEqual(['partner']);expect(target.riderStatus).toBeUndefined();expect(target.employeeRole).toBeNull();expect(target.status).toBe('active');
  expect(target.memberships).toHaveLength(1);expect(target.memberships![0]).toMatchObject({organisationId:org,organisationName:'Powerdon',domain:'partner',role:'owner',status:'active'});
  const {UserRelationships}=await import('@/components/users/UserRelationships');
  const html=renderToStaticMarkup(React.createElement(UserRelationships,{user:target}));for(const label of ['Partner','Powerdon','Owner'])expect(html).toContain(label);expect(html).not.toContain('Rider');
  expect((await users.getUsers({role:'partner'})).data!.some(u=>u.id===uid)).toBe(true);
  expect((await users.getUsers({role:'rider'})).data!.some(u=>u.id===uid)).toBe(false);
  expect((await users.getUsers({searchQuery:'powerdonnl@gmail.com'})).data?.map(u=>u.id)).toEqual([uid]);
  const counts=(await db`select (select count(*)::int from public."user") total,(select count(distinct user_id)::int from public.rider where user_id is not null) riders`)[0];
  expect(result.data).toHaveLength(counts.total);expect(result.data!.filter(u=>u.riderStatus!==undefined)).toHaveLength(counts.riders);
  evidence.target=target;evidence.relationshipHtml=html;evidence.counts=counts;evidence.searchAndFilters=true;
 },60000);
 it('uses genuine activity RPC timestamps, preserves null and refreshes without changing account activity',async()=>{
  const before=await users.getUsers();expect(before.warnings).toEqual([]);
  const ids=before.data!.map(u=>u.id),rpc=await state.client.rpc('read_account_activity',{p_actor:state.actor,p_users:ids});expect(rpc.error).toBeNull();
  for(const user of before.data!){const row=rpc.data.find((r:any)=>r.user_id===user.id);expect(user.lastActive).toBe(row.last_active_at?new Date(row.last_active_at).toISOString():undefined);expect(user.activityAvailable).toBe(true);}
  const target=before.data!.find(u=>u.id===uid)!;expect(target.lastActive).toBeUndefined();
  const again=await users.getUsers();expect(again.data!.map(u=>[u.id,u.lastActive])).toEqual(before.data!.map(u=>[u.id,u.lastActive]));
  const identity=await state.client.auth.admin.getUserById(uid);expect(identity.error).toBeNull();expect(identity.data.user.id).toBe(uid);expect(identity.data.user.last_sign_in_at).toBeFalsy();expect(identity.data.user.user_metadata.server_assigned_role).toBeUndefined();
  evidence.authIdentityReadback=true;evidence.activityAccountCount=ids.length;evidence.activityMatchesAuthoritativeRpc=true;evidence.targetHasNoRecordedActivity=true;evidence.readRefreshDidNotAdvanceActivity=true;
 },60000);
 it('keeps actual Partner Owner permissions, denies Rider-only operations and other-tenant selection',async()=>{
  const {findRiderProfile}=await import('@/features/identity/infrastructure/supabaseRiderProfileLookup');
  const {findAdminUser}=await import('@/features/identity/infrastructure/supabaseAdminUserLookup');
  const {findOrganisationMembership}=await import('@/features/organisations/infrastructure/supabaseOrganisationMembershipLookup');
  const {authenticateRequest}=await import('@/features/identity/application/commands/authenticateRequest');
  const {withPermissions,assertCapability}=await import('@/features/organisations/application/commands/authorisationService');
  expect(await findRiderProfile(uid)).toBeNull();expect(await findAdminUser(uid)).toBeNull();
  expect(await findOrganisationMembership(uid,org)).toMatchObject({role:'owner',organisationId:org,organisationType:'reward_partner'});
  const deps={verifyAccessToken:async()=>({userId:uid,email:'powerdonnl@gmail.com'}),findRiderProfile,findAdminUser,findOrganisationMembership};
  const result=await authenticateRequest({accessToken:'controlled-verification-port-not-a-live-token',preferRider:true},deps);
  expect(result.ok).toBe(true);if(!result.ok)throw Error('Partner resolution failed');
  const ctx=withPermissions(result.value);expect(ctx.principal.type).toBe('organisation');
  for(const cap of ['staff.manage','fulfilment.read','fulfilment.confirm'])expect(assertCapability(ctx,cap).ok).toBe(true);
  for(const cap of ['wallet.read','rewards.redeem','users.read'])expect(assertCapability(ctx,cap).ok).toBe(false);
  expect((await authenticateRequest({accessToken:'controlled-verification-port-not-a-live-token',organisationId:'00000000-0000-0000-0000-000000000001'},deps)).ok).toBe(false);
  evidence.partnerOwnerGrants=true;evidence.riderOnlyDenied=true;evidence.otherOrganisationDenied=true;evidence.legacyNullStaffGrantsNothing=true;
 },60000);
 it('denies the Partner account activity-reader authority, and retains the MFA boundary',async()=>{
  expect((await state.client.rpc('read_account_activity',{p_actor:uid,p_users:[uid]})).error?.code).toBe('42501');
  for(const aal of ['aal1','aal2'])await db.begin('read only',async tx=>{
   await tx.unsafe('SET LOCAL ROLE authenticated');await tx`select set_config('request.jwt.claim.sub',${state.actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:state.actor,role:'authenticated',aal})},true)`;
   expect((await tx`select public.identity_has_capability('users.read') allowed`)[0].allowed).toBe(aal==='aal2');
  });evidence.deniedActivityReaderActor=true;evidence.mfaBoundary=true;
 });
 it('sorts genuine production timestamps before pagination, retaining the null account last',async()=>{
  const rows=(await users.getUsers()).data!;
  const {getUsersTableColumns}=await import('@/components/users/UsersTableColumns');
  const columns=getUsersTableColumns({} as Parameters<typeof getUsersTableColumns>[0]);
  for(const desc of [false,true]){
   const table=createTable({data:rows,columns,state:{sorting:[{id:'lastActive',desc}],pagination:{pageIndex:0,pageSize:3}},onStateChange:()=>{},renderFallbackValue:null,getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel()});
   const sorted=table.getSortedRowModel().rows.map(r=>r.original);
   expect(sorted.at(-1)!.id).toBe(uid);
   const stamps=sorted.filter(r=>r.lastActive).map(r=>Date.parse(r.lastActive!));
   expect(stamps).toEqual([...stamps].sort((a,b)=>desc?b-a:a-b));
   const all:string[]=[];
   for(let i=0;i<table.getPageCount();i++){
    table.setOptions(old=>({...old,state:{...old.state,pagination:{pageIndex:i,pageSize:3}}}));
    all.push(...table.getRowModel().rows.map(r=>r.original.id));
   }
   expect(all).toEqual(sorted.map(r=>r.id));expect(new Set(all).size).toBe(rows.length);
  }
  evidence.actualProductionDataSortingAndPagination=true;
 },60000);
});
