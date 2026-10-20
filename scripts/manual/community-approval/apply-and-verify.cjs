// Production 065 rollout only. Requires explicit operator authorization before --apply.
// Snapshots contain counts/catalog digests only; never exports customer records.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/community-065-rollout');fs.mkdirSync(out,{recursive:true});
const revision='be89fbcd11c368d66c9cb8ab9b1fda292aecc59d',version='20261020151107',name='065_community_approved_rider_authorization';
const relative='scripts/'+name+'.sql',source=fs.readFileSync(path.join(repo,relative)),committed=execFileSync('git',['show',revision+':'+relative],{cwd:repo});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),normalized=x=>x.toString('utf8').replace(/\r\n/g,'\n');
const recorded=JSON.parse(execFileSync('git',['show',revision+':docs/verification/mobile-first-alignment/production.json'],{cwd:repo}));
assert.equal(normalized(source),normalized(committed),'Source differs from approved revision');assert.equal(hash(source),recorded.backend.sha256,'Tested file checksum mismatch');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'),'Unexpected production project');
const applying=process.argv.includes('--apply');
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,onnotice:()=>{},connection:{application_name:'movrr-community-065-authorized-rollout',statement_timeout:'30000',default_transaction_read_only:applying?'off':'on'}});
const plain=x=>JSON.parse(JSON.stringify(x));
const changedNames=new Set(['can_create_community_ride','create_my_community_ride','update_community_ride','cancel_my_community_ride','community_rider_account_active','enforce_community_rider_authorization']);
async function snapshot(tx){
 const result={
 policies:await tx`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies ORDER BY schemaname,tablename,policyname`,
 relations:await tx`SELECT n.nspname schema,c.relname,c.relkind,c.relowner::regrole::text owner,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,c.relname,c.relkind`,
 columns:await tx`SELECT n.nspname schema,c.relname,a.attname,a.attacl::text acl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attacl IS NOT NULL AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2,3`,
 functions:await tx`SELECT n.nspname schema,p.proname,p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_digest,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind<>'a' ORDER BY n.nspname,p.oid::regprocedure::text`,
 triggers:await tx`SELECT n.nspname schema,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' ORDER BY 1,2,3`,
 defaults:await tx`SELECT defaclrole::regrole::text role,defaclnamespace::regnamespace::text schema,defaclobjtype,defaclacl::text acl FROM pg_default_acl ORDER BY 1,2,3`,
 schemas:await tx`SELECT nspname,nspowner::regrole::text owner,nspacl::text acl FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY 1`,
 roles:await tx`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname`,
 states:await tx`SELECT public.account_deletion_contract_status() deletion,(SELECT jsonb_agg(redemption_enabled) FROM public.shop_release_control) shop`
 };
 result.community={};
 for(const table of ['community_ride','community_ride_participant','community_ride_creator_grant'])result.community[table]=(await tx.unsafe(`SELECT count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) digest FROM public.${table} t`))[0];
 return plain(result);
}
function catalogDigests(s){const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),r={};for(const key of ['policies','relations','columns','defaults','schemas','roles','states'])r[key]={sha256:digest(s[key]),entries:s[key].length};const functions=s.functions.filter(f=>!(f.schema==='public'&&changedNames.has(f.proname)));const triggers=s.triggers.filter(t=>!(t.schema==='public'&&t.relname==='community_ride'&&t.tgname==='community_rider_authorization'));r.unrelatedFunctions={sha256:digest(functions),entries:functions.length};r.unrelatedTriggers={sha256:digest(triggers),entries:triggers.length};r.community=s.community;return r;}
function verifyUnrelated(before,after){
 for(const key of ['policies','relations','columns','defaults','schemas','roles','states','community'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 const unrelated=rows=>rows.filter(f=>!(f.schema==='public'&&changedNames.has(f.proname)));
 assert.deepEqual(unrelated(after.functions),unrelated(before.functions),'Unrelated function definition/permission changed');
 assert.deepEqual(after.triggers.filter(t=>!(t.schema==='public'&&t.relname==='community_ride'&&t.tgname==='community_rider_authorization')),before.triggers,'Unrelated trigger changed');
 for(const f of before.functions.filter(f=>f.schema==='public'&&changedNames.has(f.proname))){
  const deployed=after.functions.find(x=>x.signature===f.signature&&x.schema===f.schema);assert(deployed,'Existing Community RPC missing');
  if(f.proname!=='can_create_community_ride')assert.equal(deployed.acl,f.acl,'Existing RPC ACL changed');
 }
}
async function verifyBoundary(tx,before){
 const live=await tx`SELECT p.proname,p.oid::regprocedure::text signature,p.prosrc,p.prosecdef,p.proconfig,p.proacl::text acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('can_create_community_ride','community_rider_account_active','enforce_community_rider_authorization','create_my_community_ride','update_community_ride','cancel_my_community_ride')`;
 const fixture=JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/community/production-contracts.json'),'utf8'));
 for(const func of ['community_rider_account_active','can_create_community_ride','enforce_community_rider_authorization']){
  const body=new RegExp('CREATE OR REPLACE FUNCTION public\\.'+func+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;').exec(source.toString('utf8'))?.[1];assert(body,'Missing tested SQL function');
  const f=live.find(x=>x.proname===func);assert.equal(f.prosrc,body,'Deployed function body differs: '+func);assert(f.prosecdef);assert.deepEqual([...f.proconfig],['search_path=""']);
 }
 for(const func of ['create_my_community_ride','update_community_ride','cancel_my_community_ride']){
  const old=fixture.functions.find(f=>f.signature.startsWith(func+'(')).definition;
  const isCreate=func==='create_my_community_ride';
  const guard=isCreate?"PERFORM public.assert_active_account();\n -- community approval before replay\n IF NOT public.can_create_community_ride(auth.uid()) THEN RAISE EXCEPTION 'Community ride creation requires an approved active rider' USING ERRCODE='42501'; END IF;":"PERFORM public.assert_active_account();\n -- community organizer account boundary\n IF NOT public.community_rider_account_active(auth.uid()) THEN RAISE EXCEPTION 'Community ride update is not permitted' USING ERRCODE='42501'; END IF;";
  const expected=old.slice(old.indexOf('AS $function$')+'AS $function$'.length,old.lastIndexOf('$function$')).replace('PERFORM public.assert_active_account();',guard);
  assert.equal(live.find(f=>f.proname===func).prosrc,expected,'RPC body differs beyond tested patch: '+func);
 }
 const rights=await tx`SELECT has_function_privilege('authenticated','public.can_create_community_ride(uuid)','EXECUTE') authenticated,has_function_privilege('anon','public.can_create_community_ride(uuid)','EXECUTE') anon,has_function_privilege('service_role','public.can_create_community_ride(uuid)','EXECUTE') service,has_function_privilege('authenticated','public.community_rider_account_active(uuid)','EXECUTE') private_active,has_function_privilege('authenticated','public.enforce_community_rider_authorization()','EXECUTE') private_trigger`;
 assert.deepEqual(plain(rights[0]),{authenticated:true,anon:false,service:false,private_active:false,private_trigger:false});
 const trigger=await tx`SELECT t.tgenabled,t.tgtype,pg_get_triggerdef(t.oid) definition FROM pg_trigger t WHERE t.tgrelid='public.community_ride'::regclass AND t.tgname='community_rider_authorization'`;
 assert.equal(trigger.length,1);assert.equal(trigger[0].tgenabled,'O');assert.equal(trigger[0].tgtype,23); // ROW + BEFORE + INSERT + UPDATE
 const create=live.find(f=>f.proname==='create_my_community_ride').prosrc;
 assert(create.indexOf('-- community approval before replay')<create.indexOf('pg_advisory_xact_lock'));
 return {functionBodiesMatchTestedSource:true,creationGuardPrecedesReplay:true,enabledBeforeInsertUpdateTrigger:true,helperPrivileges:plain(rights[0])};
}
(async()=>{
 const startedAt=new Date().toISOString();
 const result=await db.begin(applying?'':'read only',async tx=>{
  await tx.unsafe("SET LOCAL lock_timeout='5s'");
  if(applying){
   await tx.unsafe('LOCK TABLE supabase_migrations.schema_migrations IN EXCLUSIVE MODE');
   await tx.unsafe('LOCK TABLE public.community_ride,public.community_ride_participant,public.community_ride_creator_grant IN SHARE MODE');
  }
  const journal=await tx`SELECT version,name FROM supabase_migrations.schema_migrations WHERE version=${version} OR name=${name}`;
  if(!applying&&process.argv.includes('--verify')){
   assert.equal(journal.length,1,'Expected committed migration journal entry');
   const after=await snapshot(tx),baseline=JSON.parse(fs.readFileSync(path.join(repo,'docs/verification/community-065-rollout/integrity-baseline.json'),'utf8'));
   assert.deepEqual(catalogDigests(after),baseline.digests,'Post-commit protected data/catalog drift');
   const stored=(await tx`SELECT statements FROM supabase_migrations.schema_migrations WHERE version=${version}`)[0];assert.equal(hash(stored.statements[0]),hash(source));
   return {readOnlyVerification:true,journalVersion:version,journalChecksumMatches:true,boundary:await verifyBoundary(tx),community:after.community,postCommitIntegrityUnchanged:true,protectedCatalogDigests:catalogDigests(after)};
  }
  assert.equal(journal.length,0,'065 already journaled; use --verify, never reapply blindly');
  const before=await snapshot(tx);
  // Reconfirm all existing functions targeted by the candidate are still the reviewed production baseline.
  const fixture=JSON.parse(fs.readFileSync(path.join(repo,'scripts/fixtures/community/production-contracts.json'),'utf8'));
  for(const f of fixture.functions){const actual=(await tx`SELECT pg_get_functiondef(${f.signature}::regprocedure) definition`)[0].definition;assert.equal(actual,f.definition,'Production function drift: '+f.signature)}
  fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(before,null,2));
  if(!applying)return {preflightOnly:true,sourceMatchesRevision:true,testedSha256:hash(source),journalVersionReserved:version,community:before.community,catalogCounts:{policies:before.policies.length,functions:before.functions.length,relations:before.relations.length},states:before.states};
  const body=source.toString('utf8').replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'');
  await tx.unsafe(body);
  const boundary=await verifyBoundary(tx,before),after=await snapshot(tx);verifyUnrelated(before,after);
  const rollback=execFileSync('git',['show',revision+':scripts/manual/community-approval/rollback.sql'],{cwd:repo}).toString('utf8');
  await tx`INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by,idempotency_key,rollback) VALUES(${version},${name},${[source.toString('utf8')]},${'codex-authorized:'+revision},${'community-065:'+hash(source)},${[rollback]})`;
  fs.writeFileSync(path.join(out,'after.json'),JSON.stringify(after,null,2));
  return {migrationApplied:true,journalVersion:version,name,sourceRevision:revision,testedSha256:hash(source),gitBlobSha256:hash(committed),sourceMatchesRevision:true,boundary,community:after.community,communityUnchanged:true,unrelatedCatalogsAndPermissionsUnchanged:true,operatingStates:after.states};
 });
 const report={...result,startedAt,completedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw'};
 fs.writeFileSync(path.join(out,applying?'applied.json':process.argv.includes('--verify')?'postcommit-integrity.json':'preflight-summary.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message,commitStatus:"On error inspect the production journal before retrying; do not infer commit status from a client error"}));process.exitCode=1}).finally(()=>db.end());
