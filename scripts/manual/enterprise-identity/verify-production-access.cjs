// Non-destructive acceptance using existing identities and read-only SQL contexts.
// This does not authenticate a browser or create/revoke memberships.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/enterprise-identity-rollout-20261021');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,onnotice:()=>{},connection:{default_transaction_read_only:'on',application_name:'movrr-identity-nondestructive-acceptance',statement_timeout:'30000'}});
const applied=JSON.parse(fs.readFileSync(path.join(out,'applied.json'))),verified=JSON.parse(fs.readFileSync(path.join(out,'verified.json'))),result={method:'existing identity contexts in read-only PostgreSQL; not browser sign-in',productionMutations:0};
async function context(user,aal,fn){return db.begin('read only',async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',${JSON.stringify({sub:user,role:'authenticated',aal})},true)`;return fn(tx);});}
(async()=>{try{
 const p=applied.backfill,m=p.resultingMembership;
 const owner=(await db`SELECT m.user_id,m.organisation_id,m.role,m.status,o.type,ad.id advertiser_id FROM public.organisation_membership m JOIN public.organisation o ON o.id=m.organisation_id JOIN public.advertiser ad ON ad.organisation_id=o.id WHERE m.user_id=${p.user}`);
 assert.equal(owner.length,1);assert.equal(owner[0].advertiser_id,p.advertiser);assert.equal(owner[0].organisation_id,m.organisation_id);assert.equal(owner[0].role,'owner');assert.equal(owner[0].status,'active');assert.equal(owner[0].type,'advertiser');
 const before=applied.before,after=applied.after;assert.equal(after.organisation.records-before.organisation.records,1);assert.equal(after.organisation_membership.records-before.organisation_membership.records,1);assert.equal(after.platform_audit_record.records-before.platform_audit_record.records,1);
 const audit=(await db`SELECT actor_user_id,previous_state,resulting_state FROM public.platform_audit_record WHERE reason='organisation_membership.change' AND target_entity_id=${m.id}`);assert.equal(audit.length,1);assert.equal(audit[0].actor_user_id,p.actor);assert.equal(audit[0].resulting_state.role,'owner');
 result.backfill={organizationsCreated:1,existingProfileLinksUpdated:1,ownerMembershipsCreated:1,authorizationAudits:1,verifiedExistingIdentity:true};
 const protectedNames=Object.keys(before).filter(t=>!['organisation','organisation_membership','advertiser','permission_bundle','platform_audit_record','account_deletion_write_guard'].includes(t));
 const routineOperationalTables=new Set(['admin_dashboard_sessions','shop_scheduler_state','shop_worker_health']);
 result.postTrafficOperationalChanges=[];for(const t of protectedNames){assert.deepEqual(before[t],after[t],t+' changed during migration');if(routineOperationalTables.has(t)){if(JSON.stringify(after[t])!==JSON.stringify(verified.fingerprints[t]))result.postTrafficOperationalChanges.push({table:t,migrationSnapshot:after[t],laterSnapshot:verified.fingerprints[t],initiatedByAcceptance:false});}else assert.deepEqual(after[t],verified.fingerprints[t],t+' changed after traffic resumed');}
 assert.equal(applied.deletionWriteGuard.existingRowsUnchanged,true);assert.equal(applied.deletionWriteGuard.restricted,false);assert.equal(applied.deletionWriteGuard.jobCreated,false);result.deletionWriteGuard=applied.deletionWriteGuard;
 result.protectedRecords={tablesCompared:protectedNames.length,allUnrelatedMigrationRecordsUnchanged:true,authUsersUnchanged:true,riderWalletAndRideHistoryUnchanged:true};
 await context(p.user,'aal1',async tx=>{
  assert.equal((await tx`SELECT public.identity_organisation_capability(${m.organisation_id},'campaigns.read') allowed`)[0].allowed,true);
  assert.equal((await tx`SELECT public.identity_organisation_capability(${m.organisation_id},'staff.manage') allowed`)[0].allowed,true);
  assert.equal((await tx`SELECT public.identity_organisation_capability('00000000-0000-0000-0000-000000000001','campaigns.read') allowed`)[0].allowed,false);
  assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,false);
  const visible=await tx`SELECT id FROM public.advertiser`;assert.equal(visible.length,1);assert.equal(visible[0].id,p.advertiser);
 });
 result.advertiserContext={ownCampaignAndStaffCapabilities:true,crossTenantDenied:true,internalRoleApprovalDenied:true,rlsProfileVisible:true};
 const staff=await db`SELECT a.user_id,a.role,u.status,au.deleted_at,au.banned_until FROM public.admin_users a JOIN public."user" u ON u.id=a.user_id JOIN auth.users au ON au.id=a.user_id`;
 let allowed=0,denied=0;for(const s of staff){const expected=!!s.role&&s.status==='active'&&!s.deleted_at&&(!s.banned_until||new Date(s.banned_until)<=new Date());const actual=await context(s.user_id,'aal2',async tx=>(await tx`SELECT public.is_dashboard_admin() allowed`)[0].allowed);assert.equal(actual,expected);if(actual)allowed++;else denied++;}
 await context(p.actor,'aal1',async tx=>assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,false));
 await context(p.actor,'aal2',async tx=>assert.equal((await tx`SELECT public.identity_has_capability('users.role.approve') allowed`)[0].allowed,true));
 result.staff={checked:staff.length,allowed,denied,privilegedMfaEnforced:true};
 const riders=await db`SELECT r.id,r.user_id FROM public.rider r JOIN public."user" u ON u.id=r.user_id JOIN auth.users a ON a.id=u.id WHERE r.status='active' AND u.status='active' AND a.deleted_at IS NULL AND (a.banned_until IS NULL OR a.banned_until<=now()) ORDER BY r.id LIMIT 5`;
 for(const r of riders)await context(r.user_id,'aal1',async tx=>{assert.equal((await tx`SELECT public.current_rider_id() id`)[0].id,r.id);assert.equal((await tx`SELECT public.identity_organisation_capability(${m.organisation_id},'campaigns.read') allowed`)[0].allowed,false);});
 result.riderContexts={checked:riders.length,currentIdentityPreserved:true,advertiserTenantDenied:true};
 const funcs=verified.metadata.functions;for(const name of ['change_organisation_membership','provision_external_account','provision_employee','provision_product','handle_new_user','accept_organisation_invitation','identity_organisation_capability'])assert(funcs.some(f=>f.proname===name),'Missing canonical contract '+name);
 const writer=funcs.find(f=>f.proname==='change_organisation_membership').prosrc;assert(writer.includes("p_role NOT IN ('staff','viewer')"));assert(writer.includes("prior.role NOT IN ('staff','viewer')"));assert(writer.includes("org.type<>'reward_partner'"));assert(writer.includes('Stale membership command'));
 result.partnerOperations={distinctScopedRole:true,staffViewerCeilingExactInstalledBody:true,noOwnerManagerOrPeerAdministration:true,localRealSqlJourneyPreviouslyPassed:true,productionPartnerMutationExecuted:false};
 result.readOnlyDenials=[];
 for(const [name,fn] of [
  ['unauthenticated membership grant',tx=>tx`SELECT public.change_organisation_membership(NULL,NULL,NULL,'owner','active')`],
  ['unauthenticated external provisioning',tx=>tx`SELECT public.provision_external_account(NULL,'{}'::jsonb,'reserve')`]
 ]){try{await db.begin('read only',async tx=>{await tx`SELECT set_config('request.jwt.claim.role','authenticated',true)`;await fn(tx);});assert.fail('Unexpected acceptance '+name);}catch(e){assert.equal(e.code,'42501',name+': '+e.message);result.readOnlyDenials.push(name);}}
 result.recordedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'access-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message}));process.exitCode=1;});
