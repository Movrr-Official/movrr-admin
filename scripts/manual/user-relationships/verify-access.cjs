// Existing identities only; SQL read-only contexts, never HTTP authentication.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/user-relationships-rollout-20261021');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,onnotice:()=>{},connection:{application_name:'movrr-independent-users-readonly-acceptance',default_transaction_read_only:'on',statement_timeout:'30000'}});
const result={method:'existing identities in read-only PostgreSQL contexts; no browser sign-in or lifecycle writes',identityMutations:0,financialTransactions:0,emails:0};
async function context(id,aal,fn){return db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${id},true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',${JSON.stringify({sub:id,role:'authenticated',aal})},true)`;return fn(tx);});}
(async()=>{try{
 const rows=await db`SELECT u.id,public.account_identity_active(u.id) active,EXISTS(SELECT 1 FROM public.rider r WHERE r.user_id=u.id) rider,EXISTS(SELECT 1 FROM public.admin_users s WHERE s.user_id=u.id AND s.role IS NOT NULL) staff,(SELECT count(*)::int FROM public.organisation_membership m WHERE m.user_id=u.id AND m.status<>'revoked') memberships FROM public."user" u`;
 result.accounts={checked:rows.length,userOnly:rows.filter(r=>!r.rider&&!r.staff&&!r.memberships).length,riderOnlyWithoutOrganisation:rows.filter(r=>r.rider&&!r.staff&&!r.memberships).length,staffWithoutRider:rows.filter(r=>r.staff&&!r.rider).length,multipleRelationships:rows.filter(r=>Number(r.rider)+Number(r.staff)+r.memberships>1).length};
 const riders=await db`SELECT r.id,r.user_id FROM public.rider r WHERE r.status='active' AND public.account_identity_active(r.user_id) ORDER BY r.id LIMIT 5`;
 for(const r of riders)await context(r.user_id,'aal1',async tx=>{assert.equal((await tx`SELECT public.current_rider_id() id`)[0].id,r.id);assert.equal((await tx`SELECT public.identity_organisation_capability('00000000-0000-0000-0000-000000000001','campaigns.read') allowed`)[0].allowed,false);});
 result.riderContexts={checked:riders.length,currentRiderPreserved:true,unrelatedTenantDenied:true};
 const memberships=await db`SELECT m.user_id,m.organisation_id,m.status,m.role,o.type,o.status organisation_status,public.account_identity_active(m.user_id) active,public.ops_organisation_capabilities(o.type,m.role) caps FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id`;
 for(const m of memberships)await context(m.user_id,'aal1',async tx=>{for(const cap of ['campaigns.read','staff.manage','fulfilment.read','programmes.read'])assert.equal((await tx`SELECT public.identity_organisation_capability(${m.organisation_id},${cap}) allowed`)[0].allowed,!!(m.active&&m.organisation_status==='active'&&m.status==='active'&&m.caps.includes(cap)));assert.equal((await tx`SELECT public.identity_organisation_capability('00000000-0000-0000-0000-000000000001','staff.manage') allowed`)[0].allowed,false);});
 result.organisationContexts={checked:memberships.length,tenantIsolation:true,statusAndRoleCapabilities:true,byDomain:Object.fromEntries(['reward_partner','advertiser','government'].map(t=>[t,memberships.filter(m=>m.type===t).length]))};
 let userOnlyChecked=0;for(const u of rows.filter(r=>r.active&&!r.rider&&!r.staff&&!r.memberships).slice(0,5))await context(u.id,'aal1',async tx=>{assert.equal((await tx`SELECT public.account_is_active() active`)[0].active,true);assert.equal((await tx`SELECT public.current_rider_id() id`)[0].id,null);assert.equal((await tx`SELECT public.is_dashboard_admin() allowed`)[0].allowed,false);assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,false);userOnlyChecked++;});
 result.userOnlyContexts={checked:userOnlyChecked,noSyntheticAccounts:true,limitation:userOnlyChecked?null:'No existing active User-only identity available; no production identity fabricated. Exact installed contract and isolated GoTrue acceptance cover creation.'};
 const staff=await db`SELECT s.user_id,s.role,public.account_identity_active(s.user_id) active,public.ops_employee_capabilities(s.role) caps FROM public.admin_users s`;
 for(const s of staff)await context(s.user_id,'aal2',async tx=>assert.equal((await tx`SELECT public.is_dashboard_admin() allowed`)[0].allowed,!!(s.active&&s.caps.length)));
 const actor=staff.find(s=>s.active&&s.role==='super_admin');assert(actor,'Existing privileged context required');
 await context(actor.user_id,'aal1',async tx=>assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,false));
 await context(actor.user_id,'aal2',async tx=>assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,true));
 result.staffContexts={checked:staff.length,independentAuthority:true,privilegedMfaEnforced:true};
 const writer=(await db`SELECT prosrc FROM pg_proc WHERE oid='public.change_organisation_membership(uuid,uuid,uuid,text,text,timestamptz)'::regprocedure`)[0].prosrc;
 for(const clause of ["p_role NOT IN ('staff','viewer')","prior.role NOT IN ('staff','viewer')","org.type<>'reward_partner'",'Stale membership command'])assert(writer.includes(clause));
 result.partnerOperations={distinctExternalRole:true,staffViewerOnlyCeiling:true,ownerManagerPeerAndInternalGrantsDeniedByExactContract:true,productionMutationExecuted:false};
 const applied=JSON.parse(fs.readFileSync(path.join(out,'applied.json'))),verified=JSON.parse(fs.readFileSync(path.join(out,'verified.json')));
 const diffs=[];for(const [table,digest] of Object.entries(applied.after))if(JSON.stringify(digest)!==JSON.stringify(verified.fingerprints[table]))diffs.push({table,before:digest,after:verified.fingerprints[table]});
 result.recordComparisons={migration:applied.preservation,postMigrationConcurrentChanges:diffs,changesInitiatedByAcceptance:false};
 // Background workers/session reads are expected; any identity/financial/cleanup delta must be reviewed, never overwritten.
 const routine=new Set(['public.shop_scheduler_state','public.shop_worker_health','public.admin_dashboard_sessions','auth.sessions','auth.refresh_tokens','auth.audit_log_entries']);
 result.nonRoutineConcurrentChanges=diffs.filter(d=>!routine.has(d.table));
 result.recordedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'access-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message}));process.exitCode=1;});
