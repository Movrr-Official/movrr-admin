// Explicitly read-only production acceptance of the released Rider status and
// Rider-first identity source. Controlled token verification is not a browser login.
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({client:null as any,actor:'',authorize:null as any,requests:[] as {path:string,method:string}[]}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:()=>{throw Error('Mutation forbidden');}}));
vi.mock('@/lib/admin',()=>({requireCapability:(cap:string,opts?:{mutation?:boolean})=>{if(opts?.mutation)throw Error('Mutation forbidden');return state.authorize(cap);}}));
vi.mock('@/lib/supabase-admin',()=>({createSupabaseAdminClient:()=>state.client}));
describe.skipIf(process.env.MOVRR_PRODUCTION_RIDER_STATUS_READONLY!=='1')('Rider status 081 release: production read-only acceptance',()=>{
 let db:ReturnType<typeof postgres>;
 const evidence:any={method:'Released source adapters/handlers against production reads with controlled token verification; no browser session, login or production write',productionWrites:0};
 beforeAll(async()=>{
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
   if(!['GET','HEAD'].includes(method)&&!(method==='POST'&&['/rest/v1/rpc/account_identity_active','/rest/v1/rpc/read_account_activity'].includes(url.pathname)))throw Error('Non-read production request blocked: '+method+' '+url.pathname);
   return fetch(input,init);
  };
  state.client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:readFetch}});
  evidence.before=await snapshot();
 },60000);
 afterAll(async()=>{if(db){evidence.after=await snapshot();evidence.recordedAt=new Date().toISOString();evidence.requests=state.requests;
  writeFileSync('docs/verification/rider-status-081/production-acceptance.json',JSON.stringify(evidence,null,2)+'\n');await db.end();}});
 const snapshot=async()=>(await db`select
  (select jsonb_object_agg(status,n) from (select status::text,count(*)::int n from public.rider group by 1) s) rider_status,
  (select count(*)::int from public.platform_audit_record where reason='rider_status.change') status_audits,
  (select count(*)::int from public.user_activity where action like 'Rider activated%' or action like 'Rider suspended%') status_activity,
  (select state from public.shop_release_control where singleton) shop_state,
  (select redemption_enabled from public.shop_release_control where singleton) redemption_enabled,
  (select requests_enabled from public.account_deletion_contract_gate where singleton) deletion_intake,
  (select managed_resources_execution_enabled from public.account_deletion_contract_gate where singleton) deletion_execution`)[0];

 it('resolves every production account through the released identity adapters as its canonical relationships allow',async()=>{
  const {authenticateRequest}=await import('@/features/identity/application/commands/authenticateRequest');
  const {findAdminUser}=await import('@/features/identity/infrastructure/supabaseAdminUserLookup');
  const {findRiderProfile}=await import('@/features/identity/infrastructure/supabaseRiderProfileLookup');
  const {findOrganisationMembership}=await import('@/features/organisations/infrastructure/supabaseOrganisationMembershipLookup');
  const {isRiderOwnedApiPath}=await import('@/lib/pathMatch');
  const {withPermissions,assertCapability}=await import('@/features/organisations/application/commands/authorisationService');
  const accounts=await db`select a.id,
   exists(select 1 from public.rider r where r.user_id=a.id and r.status='active') active_rider,
   (select role from public.admin_users x where x.user_id=a.id) staff_role,
   (select count(*)::int from public.organisation_membership m join public.organisation o on o.id=m.organisation_id where m.user_id=a.id and m.status='active' and o.status='active') memberships,
   public.account_identity_active(a.id) active from auth.users a`;
  const outcomes:Record<string,number>={};
  for(const account of accounts){
   const deps={verifyAccessToken:async()=>({userId:account.id,email:null}),findAdminUser,findRiderProfile,findOrganisationMembership};
   for(const [route,capability] of [['/api/v1/riders/me/campaigns','rewards.catalog.read'],['/api/v1/community-rides','rewards.catalog.read'],['/api/v1/rewards/catalog','rewards.catalog.read']] as const){
    const auth=await authenticateRequest({accessToken:'controlled',requiredCapability:capability,preferRider:isRiderOwnedApiPath(route)},deps);
    const principal=auth.ok?auth.value.principal.type:'denied';
    const allowed=auth.ok&&assertCapability(withPermissions(auth.value),capability).ok;
    // Rider-owned handlers serve only a Rider principal: active Riders resolve as Riders; nobody else does.
    expect(principal==='rider').toBe(account.active&&account.active_rider);
    if(principal==='rider')expect(allowed).toBe(true);
    const key=`${route} ${account.active_rider?'rider':account.staff_role?'staff':account.memberships?'organisation':'none'}->${principal}`;outcomes[key]=(outcomes[key]??0)+1;
   }
  }
  evidence.accounts=accounts.length;evidence.principalOutcomes=outcomes;
 },120000);

 it('reads the Riders dashboard with each Rider profile status the editor submits',async()=>{
  const {getRiders}=await import('@/app/actions/riders');
  const result=await getRiders();expect(result.success).toBe(true);
  const rows=await db`select id,status::text from public.rider where user_id is not null`;
  for(const row of rows){const rider=result.data!.find(r=>r.id===row.id);if(!rider)continue;expect(rider.profileStatus).toBe(row.status==='active'?'active':'inactive');}
  evidence.ridersListed=result.data!.length;evidence.profileStatus=Object.fromEntries(['active','inactive'].map(s=>[s,result.data!.filter(r=>r.profileStatus===s).length]));
 },120000);

 it('keeps the status command service-role only and blocks mutation paths in this acceptance',async()=>{
  const f=(await db`select has_function_privilege('anon','public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean)','EXECUTE') anon,
   has_function_privilege('authenticated','public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean)','EXECUTE') authenticated,
   has_function_privilege('service_role','public.admin_set_rider_status(uuid,uuid,boolean,boolean,text,boolean)','EXECUTE') service_role`)[0];
  expect(f).toEqual({anon:false,authenticated:false,service_role:true});
  const {bulkUpdateRiderStatus}=await import('@/app/actions/riders');
  await expect(bulkUpdateRiderStatus([{id:'00000000-0000-0000-0000-000000000000',expectedStatus:'active'}],'inactive')).resolves.toMatchObject({success:false,updated:0});
  expect(state.requests.some(r=>r.path.endsWith('/admin_set_rider_status'))).toBe(false);
  const staff=await db`select role,public.ops_employee_capabilities(role) ? 'riders.manage' manage from public.admin_users where role is not null`;
  evidence.staffRidersManage=staff;evidence.commandPrivileges=f;
 },60000);

 it('leaves Rider statuses, audits and operating gates unchanged',async()=>{
  const now=await snapshot();expect(now).toEqual(evidence.before);
  expect(now).toMatchObject({status_audits:0,shop_state:'disabled',redemption_enabled:false,deletion_intake:true,deletion_execution:false});
 },60000);
});
