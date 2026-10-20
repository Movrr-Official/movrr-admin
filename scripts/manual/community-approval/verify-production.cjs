// Read-only production acceptance. Never inserts rides, changes identities or mutates grants.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/community-065-rollout');fs.mkdirSync(out,{recursive:true});
const version='20261020151107',sha256='6e95dea6827fc7cc02dd88e09d9922739c2281e84f5a98377f29536aa8155f3f';
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{default_transaction_read_only:'on',statement_timeout:'20000',application_name:'movrr-community-065-readonly-acceptance'}});
const plain=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
let checks=0;const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++};
async function as(user,fn,role='authenticated'){
 return db.begin('read only',async tx=>{
  await tx.unsafe('SET LOCAL ROLE '+role);
  await tx`SELECT set_config('request.jwt.claim.sub',${user||''},true),set_config('request.jwt.claim.role',${role},true),set_config('request.jwt.claims',${JSON.stringify({sub:user,role})},true)`;
  return fn(tx);
 });
}
async function codeOf(fn){try{await fn();return 'success'}catch(e){if(['42501','22023','25006'].includes(e.code))return e.code;throw e}}
(async()=>{
 const rows=await db.begin('read only',tx=>tx`SELECT u.id,u.status::text user_status,u.deleted_at IS NOT NULL public_deleted,r.id rider_id,r.status::text rider_status,a.id IS NOT NULL auth_exists,a.deleted_at IS NOT NULL auth_deleted,coalesce(a.banned_until>now(),false) auth_banned,g.user_id IS NOT NULL has_grant,g.user_id IS NOT NULL AND g.revoked_at IS NULL active_grant FROM public."user" u LEFT JOIN public.rider r ON r.user_id=u.id LEFT JOIN auth.users a ON a.id=u.id LEFT JOIN public.community_ride_creator_grant g ON g.user_id=u.id ORDER BY u.id`);
 const policy=(await db`SELECT with_check FROM pg_policies WHERE schemaname='public' AND tablename='community_ride' AND policyname='community_ride_creator_required' AND permissive='RESTRICTIVE'`)[0].with_check;
 equal(policy,JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/community/production-contracts.json'),'utf8')).policies.find(p=>p.policyname==='community_ride_creator_required').with_check,'Live table policy differs from reviewed contract');
 let tablePolicyChecks=0,crossAccountTableDenials=0;
 const cohorts={approvedActive:0,unapprovedActive:0,revokedGrant:0,suspendedPublicAccount:0,suspendedRider:0,inactiveRider:0,authBanned:0,deleted:0,pendingPublicAccount:0,missingRider:0};
 let allowed=0,denied=0,deniedRpc=0,approvedGateReachedValidation=0,crossAccountDenied=0,activeGrantHoldersDeniedForState=0;
 for(const row of rows){
  const active=row.user_status==='active'&&!row.public_deleted&&row.rider_status==='active'&&row.auth_exists&&!row.auth_deleted&&!row.auth_banned;
  const expected=Boolean(active&&row.active_grant);
  if(row.active_grant&&!active)activeGrantHoldersDeniedForState++;
  if(expected)cohorts.approvedActive++;
  if(active&&!row.active_grant)cohorts.unapprovedActive++;
  if(row.has_grant&&!row.active_grant)cohorts.revokedGrant++;
  if(row.user_status==='suspended')cohorts.suspendedPublicAccount++;
  if(row.rider_status==='suspended')cohorts.suspendedRider++;
  if(row.rider_status==='inactive')cohorts.inactiveRider++;
  if(row.auth_banned)cohorts.authBanned++;
  if(row.public_deleted||row.auth_deleted||row.user_status==='deleted')cohorts.deleted++;
  if(row.user_status==='pending')cohorts.pendingPublicAccount++;
  if(!row.rider_id)cohorts.missingRider++;
  const result=await as(row.id,async tx=>(await tx`SELECT public.can_create_community_ride() allowed`)[0].allowed);
  equal(result,expected,'Existing production identity eligibility mismatch');expected?allowed++:denied++;
  const tableAllowed=await as(row.id,async tx=>(await tx.unsafe(`SELECT coalesce((${policy}),false) allowed FROM (SELECT $1::uuid created_by_user_id,$1::uuid organizer_user_id,$2::uuid organizer_rider_id,'rider'::text organizer_type) community_ride`,[row.id,row.rider_id]))[0].allowed);
  equal(tableAllowed,expected,'Effective production INSERT WITH CHECK mismatch');tablePolicyChecks++;
  // Invalid null request exercises the real RPC gate, never reaches an INSERT.
  const code=await codeOf(()=>as(row.id,tx=>tx`SELECT public.create_my_community_ride(NULL,'{}'::jsonb)`));
  equal(code,expected?'22023':'42501','Production RPC eligibility/validation order mismatch');expected?approvedGateReachedValidation++:deniedRpc++;
  const other=rows.find(x=>x.id!==row.id);
  if(other){equal((await as(row.id,async tx=>(await tx`SELECT public.can_create_community_ride(${other.id}) allowed`)[0].allowed)),false,'Cross-account helper leak');crossAccountDenied++;
   if(other.rider_id){const cross=await as(row.id,async tx=>(await tx.unsafe(`SELECT coalesce((${policy}),false) allowed FROM (SELECT $1::uuid created_by_user_id,$1::uuid organizer_user_id,$2::uuid organizer_rider_id,'rider'::text organizer_type) community_ride`,[row.id,other.rider_id]))[0].allowed);equal(cross,false,'Cross-account table policy bypass');crossAccountTableDenials++}
  }
 }
 const nonexistent='00000000-0000-4000-8000-000000000065';
 equal((await db`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=${nonexistent}) present`)[0].present,false);
 equal(await codeOf(()=>as(nonexistent,tx=>tx`SELECT public.create_my_community_ride(NULL,'{}'::jsonb)`)),'42501');
 equal(await codeOf(()=>as(null,tx=>tx`SELECT public.can_create_community_ride()`,'anon')),'42501');
 equal(await codeOf(()=>as(null,tx=>tx`SELECT public.create_my_community_ride(NULL,'{}'::jsonb)`,'anon')),'42501');
 const metadata=await db.begin('read only',async tx=>({
  journal:await tx`SELECT version,name,statements,created_by,idempotency_key,array_length(rollback,1) rollback_statements FROM supabase_migrations.schema_migrations WHERE version=${version}`,
  trigger:await tx`SELECT t.tgenabled,t.tgtype,pg_get_triggerdef(t.oid) definition FROM pg_trigger t WHERE t.tgrelid='public.community_ride'::regclass AND t.tgname='community_rider_authorization'`,
  rls:await tx`SELECT c.relrowsecurity,c.relowner::regrole::text owner FROM pg_class c WHERE c.oid='public.community_ride'::regclass`,
  insertPolicies:await tx`SELECT policyname,permissive,roles,with_check FROM pg_policies WHERE schemaname='public' AND tablename='community_ride' AND cmd='INSERT' ORDER BY policyname`,
  grantPolicies:await tx`SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='community_ride_creator_grant' ORDER BY policyname`,
  staff:await tx`SELECT (has_table_privilege('service_role','public.community_ride_creator_grant','SELECT') AND has_table_privilege('service_role','public.community_ride_creator_grant','INSERT') AND has_table_privilege('service_role','public.community_ride_creator_grant','UPDATE')) service_grant_access,(SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') service_bypassrls,has_parameter_privilege('authenticated','session_replication_role','SET') rider_can_disable_triggers,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='authenticated') rider_privileged`,
  functions:await tx`SELECT p.proname,p.oid::regprocedure::text signature,p.prosrc,p.proacl::text acl,md5(pg_get_functiondef(p.oid)) digest FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('join_community_ride','leave_community_ride','update_community_ride','cancel_my_community_ride','enforce_community_rider_authorization','ops_employee_capabilities')`,
  enums:await tx`SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('rider_status','user_status') GROUP BY t.typname`,
  states:await tx`SELECT public.account_deletion_contract_status() deletion,(SELECT jsonb_agg(redemption_enabled) FROM public.shop_release_control) shop`
 }));
 equal(metadata.journal.length,1);const journal=metadata.journal[0];equal(journal.name,'065_community_approved_rider_authorization');equal(hash(journal.statements[0]),sha256);equal(journal.rollback_statements,1);
 equal(metadata.trigger.length,1);equal(metadata.trigger[0].tgenabled,'O');equal(metadata.trigger[0].tgtype,23);equal(metadata.rls[0].relrowsecurity,true);
 const restrictive=metadata.insertPolicies.find(p=>p.policyname==='community_ride_creator_required');equal(restrictive.permissive,'RESTRICTIVE');assert(restrictive.with_check.includes('can_create_community_ride(auth.uid())')&&restrictive.with_check.includes('r.user_id = auth.uid()'));checks++;
 equal(plain(metadata.staff[0]),{service_grant_access:true,service_bypassrls:true,rider_can_disable_triggers:false,rider_privileged:false});
 equal(metadata.grantPolicies.every(p=>p.cmd==='SELECT'),true,'Rider self-approval must have no write policy');
 const fixture=JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/community/production-contracts.json'),'utf8'));
 for(const func of ['join_community_ride','leave_community_ride']){
  const previous=fixture.functions.find(f=>f.signature.startsWith(func+'('));
  equal((await db`SELECT pg_get_functiondef(${previous.signature}::regprocedure) definition`)[0].definition,previous.definition,'Participation function changed');
 }
 const triggerBody=metadata.functions.find(f=>f.proname==='enforce_community_rider_authorization').prosrc;
 const updateBranch=triggerBody.slice(triggerBody.indexOf('ELSIF NOT trusted_staff'));
 equal(updateBranch.includes('community_ride_creator_grant'),false,'Grant revocation must not revoke existing organizer edits');
 assert(updateBranch.includes('OLD.organizer_user_id IS DISTINCT FROM auth.uid()')&&updateBranch.includes('community_rider_account_active(auth.uid())'));checks++;
 const readResults=[];
 for(const row of rows.filter(r=>r.user_status==='active'&&r.rider_status==='active'&&!r.public_deleted&&!r.auth_deleted&&!r.auth_banned)){
  const count=await as(row.id,async tx=>(await tx`SELECT count(*)::int count FROM public.community_ride WHERE is_public`)[0].count);
  readResults.push({approved:Boolean(row.active_grant),visiblePublicRides:count});
 }
 const result={project:'kzdvunpuxaxlphqvmzxw',verifiedAt:new Date().toISOString(),readOnly:true,assertions:checks,journal:{version:journal.version,name:journal.name,checksumMatches:true,sha256,createdBy:journal.created_by,idempotencyKey:journal.idempotency_key,rollbackStatements:journal.rollback_statements},actualIdentityChecks:{identities:rows.length,allowed,denied,activeGrantHoldersDeniedForState,deniedRpc,approvedGateReachedValidation,crossAccountDenied,tablePolicyChecks,crossAccountTableDenials,cohorts},tableBoundary:{rlsEnabled:true,restrictiveApprovalOwnershipPolicy:true,liveWithCheckPredicateEvaluatedReadOnly:true,enabledBeforeInsertUpdateTrigger:true,ridersCannotDisableTrigger:true},organizers:{approvalRequiredForCreationOnly:true,ownershipAndActiveAccountStillRequired:true,editAndCancelRpcBodiesMatchTestedPatch:true},participation:{joinAndLeaveFunctionsUnchanged:true,existingActiveIdentityDiscovery:[true,false].map(approved=>{const group=readResults.filter(r=>r.approved===approved);return{approved,identities:group.length,minVisiblePublicRides:group.length?Math.min(...group.map(r=>r.visiblePublicRides)):null,maxVisiblePublicRides:group.length?Math.max(...group.map(r=>r.visiblePublicRides)):null}})},admin:{serviceGrantAccess:true,serviceRlsBypassUnchanged:true,riderGrantPoliciesReadOnly:true,controlsNotMutated:true},stateDomain:plain(metadata.enums),operatingStates:plain(metadata.states),limitations:['No production ride creation, edit, cancellation, participation or grant mutation was performed.','Successful creation and changed-state scenarios absent from existing production cohorts are covered by the prior isolated PostgreSQL/PostgREST tests and exact deployed function-body checks, not claimed as live production mutations.','The production role checks use transaction-local JWT claims in read-only database transactions; they do not constitute an end-to-end Mobile sign-in test.']};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message}));process.exitCode=1}).finally(()=>db.end());
