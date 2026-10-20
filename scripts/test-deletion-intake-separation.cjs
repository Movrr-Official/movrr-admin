// Synthetic localhost PostgreSQL only. Never reads .env or production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const opts={host:'127.0.0.1',port:55439,username:'postgres',password:'isolated-local-test-only',max:8,onnotice:()=>{}},root=postgres({...opts,database:'postgres'}),name='movrr_intake_separation_'+process.pid,db=postgres({...opts,database:name});
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8'),id=()=>crypto.randomUUID();let n=0;
const equal=(a,b)=>{assert.deepEqual(a,b);n++;},deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);n++;};
const migration=file=>db.begin(tx=>tx.unsafe(read(file).replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
async function main(){
 await root.unsafe('CREATE DATABASE '+name);await require('./test-alignment-database.cjs').fixture(db);
 const governance=read('../../movrr-mobile/scripts/034_account_deletion_governance.sql');
 // Exact governance table contracts; fixture data is the captured pending v1 policy.
 for(const table of ['policy_version','retention_rule']){
  const start=governance.indexOf('CREATE TABLE public.account_deletion_'+table);
  await db.unsafe(governance.slice(start,governance.indexOf('\n);',start)+4));
 }
 const action=read('../../movrr-mobile/scripts/037_account_deletion_execution_contract.sql');
 await db.unsafe(action.slice(action.indexOf('CREATE TABLE public.account_deletion_action_rule'),action.indexOf('\n);')+4));
 const fixture=JSON.parse(read('fixtures/deletion-intake/policy-v1.json'));
 await db`INSERT INTO account_deletion_policy_version ${db(fixture.policy)}`;
 for(const row of fixture.retention)await db`INSERT INTO account_deletion_retention_rule ${db(row)}`;
 for(const row of fixture.actions)await db`INSERT INTO account_deletion_action_rule ${db(row)}`;
 await db.unsafe(`CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE account_deletion_contract_gate(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),requests_enabled boolean NOT NULL DEFAULT false,catalog_digest text,catalog_verified_at timestamptz,catalog_review_reference text,barrier_verified_at timestamptz,disposition_verified_at timestamptz,active_policy_version integer NOT NULL DEFAULT 1 REFERENCES account_deletion_policy_version,managed_resources_execution_enabled boolean NOT NULL DEFAULT false,CHECK(NOT requests_enabled OR(catalog_digest IS NOT NULL AND catalog_verified_at IS NOT NULL AND catalog_review_reference IS NOT NULL AND barrier_verified_at IS NOT NULL AND disposition_verified_at IS NOT NULL)));
 INSERT INTO account_deletion_contract_gate(singleton) VALUES(true);
 ALTER TABLE account_deletion_jobs ADD UNIQUE(user_id);
 CREATE TABLE account_deletion_write_guard(user_id uuid PRIMARY KEY,restricted boolean DEFAULT false,job_id uuid,changed_at timestamptz DEFAULT now());
 CREATE TABLE account_deletion_audit(job_id uuid,actor_user_id uuid,event_code text,created_at timestamptz DEFAULT now());
 CREATE TABLE account_deletion_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_id uuid,category text,reason_code text,owner_capability text,state text DEFAULT 'open',due_at timestamptz,UNIQUE(job_id,category,reason_code));
 CREATE TABLE account_deletion_receipt_access(job_id uuid PRIMARY KEY,token_digest bytea,expires_at timestamptz);
 CREATE TABLE account_deletion_completion_receipt(job_id uuid PRIMARY KEY,policy_version integer,expires_at timestamptz,completed_at timestamptz,exception_count integer);
 CREATE TABLE account_deletion_operator_proposal(id uuid DEFAULT gen_random_uuid(),job_id uuid,category text,action text,reference text,decision text,proposed_by uuid,reviewed_by uuid);
 CREATE TABLE account_deletion_hold(job_id uuid,released_at timestamptz);
 CREATE FUNCTION account_deletion_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only deletion governance';END $$;
 CREATE TRIGGER policy_immutable BEFORE UPDATE OR DELETE ON account_deletion_policy_version FOR EACH ROW EXECUTE FUNCTION account_deletion_immutable();
 CREATE TRIGGER retention_immutable BEFORE UPDATE OR DELETE ON account_deletion_retention_rule FOR EACH ROW EXECUTE FUNCTION account_deletion_immutable();
 CREATE TRIGGER action_immutable BEFORE UPDATE OR DELETE ON account_deletion_action_rule FOR EACH ROW EXECUTE FUNCTION account_deletion_immutable();
 CREATE FUNCTION account_deletion_assert_claim(p_job uuid,p_token uuid) RETURNS public.account_deletion_jobs LANGUAGE plpgsql AS $$ DECLARE j public.account_deletion_jobs;BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_job AND lease_token=p_token AND status='processing' AND lease_until>clock_timestamp();
 IF j.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.account_deletion_write_guard WHERE job_id=j.id AND user_id=j.user_id AND restricted) THEN RAISE EXCEPTION 'claim required';END IF;RETURN j;END $$;`);
 await db.unsafe(read('fixtures/deletion-intake/production-functions.sql'));
 await migration('060_account_deletion_intake_control.sql');
 const live=JSON.parse(read('fixtures/deletion-intake/separation-baseline.json')).functions;
 for(const f of live.filter(f=>['account_deletion_activation_authorized','read_account_deletion_lifecycle','read_account_deletion_delivered_receipt','claim_account_deletions','account_deletion_monitor'].includes(f.proname)))await db.unsafe(f.definition);
 await db.unsafe(`REVOKE ALL ON account_deletion_jobs,account_deletion_review,account_deletion_audit,account_deletion_receipt_access,account_deletion_policy_version,account_deletion_retention_rule,account_deletion_action_rule FROM PUBLIC,anon,authenticated,service_role;
 REVOKE ALL ON FUNCTION request_verified_account_deletion(uuid,integer,boolean),request_verified_account_deletion_core(uuid,integer,boolean),read_account_deletion_lifecycle(uuid,uuid),read_account_deletion_delivered_receipt(uuid,text),account_deletion_activation_authorized(uuid,uuid),account_deletion_monitor(uuid) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION request_verified_account_deletion(uuid,integer,boolean),read_account_deletion_lifecycle(uuid,uuid),read_account_deletion_delivered_receipt(uuid,text),account_deletion_activation_authorized(uuid,uuid),account_deletion_monitor(uuid) TO service_role;`);
 for(const f of live){
  await db.unsafe(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC,anon,authenticated,service_role`);
  for(const role of ['anon','authenticated','service_role'])if(f.acl.includes(role+'=X/'))await db.unsafe(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${role}`);
 }
 await db.unsafe('REVOKE ALL ON FUNCTION account_deletion_rule_allowed(integer,text) FROM PUBLIC,anon,authenticated,service_role');
 const security=id(),support=id(),rider=id(),other=id(),inactive=id(),banned=id(),nonrider=id(),deliveryFailure=id();
 for(const u of [security,support,rider,other,inactive,banned,nonrider,deliveryFailure]){
  await db`INSERT INTO "user"(id,email,status,role) VALUES(${u},${u+'@isolated.invalid'},'active','rider')`;
  await db`INSERT INTO auth.users(id) VALUES(${u})`;
  if(u!==nonrider)await db`INSERT INTO rider(id,user_id,status) VALUES(${id()},${u},'active')`;
 }
 await db`INSERT INTO admin_users VALUES(${security},'security_admin'),(${support},'support_agent')`;
 await db`UPDATE "user" SET status='suspended' WHERE id=${inactive}`;
 await db`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=${banned}`;
 const session=(actor,fn,aal='aal2',role='authenticated')=>db.begin(async tx=>{
  await tx.unsafe('SET LOCAL ROLE '+role);await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:actor,role,aal})},true),set_config('request.jwt.claim.sub',${actor},true)`;return fn(tx);
 });
 const command=(state,version,operation=id(),aal='aal2',actor=security)=>session(actor,async tx=>(await tx`SELECT set_account_deletion_intake(${state},${version},'Owner approved intake only',${operation}) r`)[0].r,aal);
 const request=user=>session(user,async tx=>(await tx`SELECT request_verified_account_deletion(${user},1,true) r`)[0].r,'aal2','service_role');
 const receipt=(job,secret)=>db`SELECT read_account_deletion_delivered_receipt(${job},${secret}) r`;
 const preserved={policy:await db`SELECT * FROM account_deletion_policy_version WHERE version=1`,retention:await db`SELECT * FROM account_deletion_retention_rule WHERE policy_version=1 ORDER BY category`,actions:await db`SELECT * FROM account_deletion_action_rule WHERE policy_version=1 ORDER BY scope`};
 await db.unsafe(`CREATE OR REPLACE FUNCTION public.account_deletion_contract_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT '{"requestsEnabled":true}'::jsonb $$;`);
 await deny(()=>migration('066_deletion_intake_execution_separation.sql'),'P0001');
 equal((await db`SELECT to_regprocedure('public.account_deletion_intake_ready(integer)') r`)[0].r,null);
 await db.unsafe(live.find(f=>f.proname==='account_deletion_contract_status').definition);
 await migration('066_deletion_intake_execution_separation.sql');
 await deny(()=>command('enabled',0),'55000'); // Genuine receipt delivery is still required.
 await migration('067_deletion_intake_receipt_policy.sql');
 equal(await db`SELECT * FROM account_deletion_policy_version WHERE version=1`,preserved.policy);
 equal(await db`SELECT * FROM account_deletion_retention_rule WHERE policy_version=1 ORDER BY category`,preserved.retention);
 equal(await db`SELECT * FROM account_deletion_action_rule WHERE policy_version=1 ORDER BY scope`,preserved.actions);
 equal(Number((await db`SELECT count(*) n FROM account_deletion_retention_rule WHERE policy_version=2 AND approval_status='approved'`)[0].n),1);
 equal(Number((await db`SELECT count(*) n FROM account_deletion_action_rule WHERE policy_version=2 AND public.account_deletion_rule_allowed(policy_version,scope)`)[0].n),1);
 equal((await db`SELECT legal_status,finance_status,partner_status FROM account_deletion_policy_version WHERE version=2`)[0],{legal_status:'pending',finance_status:'pending',partner_status:'pending'});
 equal((await db`SELECT public.account_deletion_rule_allowed(2,'personal.erase') allowed`)[0].allowed,false);
 await deny(()=>command('enabled',0,id(),'aal1'),'42501');
 await deny(()=>command('enabled',0,id(),'aal2',support),'42501');
 await deny(()=>session(rider,tx=>tx`SELECT set_account_deletion_intake('enabled',0,'Rider cannot activate',${id()})`),'42501');
 await deny(()=>session(security,tx=>tx`UPDATE account_deletion_contract_gate SET operating_state='enabled'`),'42501');
 await db.unsafe(`CREATE FUNCTION fail_intake_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure';END $$;CREATE TRIGGER fail_intake_audit BEFORE INSERT ON platform_audit_record FOR EACH ROW EXECUTE FUNCTION fail_intake_audit();`);
 await deny(()=>command('enabled',0),'P0001');
 equal((await db`SELECT operating_version,operating_state FROM account_deletion_contract_gate`)[0],{operating_version:'0',operating_state:'disabled'});
 equal(Number((await db`SELECT count(*) n FROM ops_command_receipt`)[0].n),0);
 await db.unsafe('DROP TRIGGER fail_intake_audit ON platform_audit_record');
 const operation=id(),enabled=await command('enabled',0,operation);
 equal(enabled.requestsEnabled,true);equal(enabled.version,1);equal(enabled.policyVersion,2);
 equal(await command('enabled',0,operation),enabled);
 await deny(()=>command('hold',0),'40001');
 equal(Number((await db`SELECT count(*) n FROM platform_audit_record WHERE correlation_id=${operation}`)[0].n),1);
 equal((await db`SELECT previous_state,resulting_state,actor_user_id FROM platform_audit_record WHERE correlation_id=${operation}`)[0],{previous_state:{state:'disabled',version:0},resulting_state:enabled,actor_user_id:security});
 equal((await db`SELECT managed_resources_execution_enabled FROM account_deletion_contract_gate`)[0].managed_resources_execution_enabled,false);
 await deny(()=>db`UPDATE account_deletion_contract_gate SET managed_resources_execution_enabled=true`,'23514');
 await deny(()=>session(security,tx=>tx`SELECT account_deletion_intake_ready(2)`),'42501');
 for(const user of [inactive,banned,nonrider,id()])await deny(()=>request(user),'42501');
 await assert.rejects(db`SELECT request_verified_account_deletion(${rider},1,false)`,/acknowledgement required/);n++;
 await deny(()=>session(rider,tx=>tx`SELECT request_verified_account_deletion(${other},1,true)`),'42501');
 await db.unsafe(`CREATE FUNCTION fail_receipt_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt storage failure';END $$;CREATE TRIGGER fail_receipt BEFORE INSERT ON account_deletion_receipt_access FOR EACH ROW EXECUTE FUNCTION fail_receipt_delivery();`);
 await deny(()=>request(deliveryFailure),'P0001');
 equal(Number((await db`SELECT count(*) n FROM account_deletion_jobs WHERE user_id=${deliveryFailure}`)[0].n),0);
 equal(Number((await db`SELECT count(*) n FROM account_deletion_write_guard WHERE user_id=${deliveryFailure}`)[0].n),0);
 await db.unsafe('DROP TRIGGER fail_receipt ON account_deletion_receipt_access');
 const accepted=await request(rider),job=accepted.requestId,credential=accepted.receiptAccess.credential;
 equal(accepted.status,'restricted');equal(accepted.policyVersion,2);equal(credential.length,64);
 const row=(await db`SELECT requested_at,review_required,review_code,review_due_at FROM account_deletion_jobs WHERE id=${job}`)[0];
 equal(row.review_required,true);equal(row.review_code,'intake_review_required');
 equal(Number((await db`SELECT count(*) n FROM account_deletion_review WHERE job_id=${job} AND state='open'`)[0].n),1);
 equal((await db`SELECT restricted FROM account_deletion_write_guard WHERE user_id=${rider}`)[0].restricted,true);
 const access=(await db`SELECT token_digest,expires_at FROM account_deletion_receipt_access WHERE job_id=${job}`)[0];
 equal(access.token_digest.toString('hex'),crypto.createHash('sha256').update(credential).digest('hex'));
 equal(access.expires_at.getTime()-row.requested_at.getTime(),30*24*60*60*1000);
 equal((await receipt(job,credential))[0].r.status,'manual_review');
 await deny(()=>receipt(job,'a'.repeat(64)),'42501');
 await deny(()=>db`SELECT read_account_deletion_lifecycle(${job},${other})`,'42501');
 await deny(()=>session(other,tx=>tx`SELECT read_account_deletion_lifecycle(${job},${rider})`),'42501');
 const retried=await request(rider);equal(retried.requestId,job);equal(retried.receiptAccess.expiresAt,accepted.receiptAccess.expiresAt);
 equal(Number((await db`SELECT count(*) n FROM account_deletion_jobs WHERE user_id=${rider}`)[0].n),1);
 await deny(()=>receipt(job,credential),'42501'); // Rotation revokes the old credential.
 equal((await receipt(job,retried.receiptAccess.credential))[0].r.requestId,job);
 const concurrent=await Promise.all([request(other),request(other)]);equal(concurrent[0].requestId,concurrent[1].requestId);
 const concurrentAccess=(await db`SELECT token_digest FROM account_deletion_receipt_access WHERE job_id=${concurrent[0].requestId}`)[0];
 const currentOtherCredential=concurrent.find(r=>crypto.createHash('sha256').update(r.receiptAccess.credential).digest('hex')===concurrentAccess.token_digest.toString('hex')).receiptAccess.credential;
 equal(Number((await db`SELECT count(*) n FROM account_deletion_review WHERE job_id=${concurrent[0].requestId}`)[0].n),1);
 equal((await db`SELECT count(*) n FROM claim_account_deletions(1)`)[0].n,'0'); // Intake does not queue a worker claim.
 await db.begin(async tx=>{
  const lease=id();await tx`UPDATE account_deletion_jobs SET status='processing',lease_token=${lease},lease_until=clock_timestamp()+interval '5 minutes' WHERE id=${job}`;
  equal((await tx`SELECT account_deletion_activation_authorized(${job},${lease}) allowed`)[0].allowed,false);
  await tx`UPDATE account_deletion_jobs SET status='pending',lease_token=NULL,lease_until=NULL WHERE id=${job}`;
 });
 const monitor=(await db`SELECT account_deletion_monitor(${security}) r`)[0].r;
 equal(monitor.find(x=>x.requestId===job).status,'manual_review');
 // Existing expiry check is server-side and does not depend on client clocks or a purge job.
 await db`UPDATE account_deletion_receipt_access SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=${job}`;
 await deny(()=>receipt(job,retried.receiptAccess.credential),'42501');
 equal(Number((await db`SELECT count(*) n FROM account_deletion_jobs WHERE id=${job}`)[0].n),1);
 await db`UPDATE account_deletion_jobs SET requested_at=clock_timestamp()-interval '31 days' WHERE id=${job}`;
 const expiredRetry=await request(rider);equal(expiredRetry.requestId,job);equal(expiredRetry.receiptAccess,undefined);
 equal((await db`SELECT expires_at<clock_timestamp() expired FROM account_deletion_receipt_access WHERE job_id=${job}`)[0].expired,true);
 const before=await db`SELECT * FROM account_deletion_jobs ORDER BY id`,receipts=await db`SELECT * FROM account_deletion_receipt_access ORDER BY job_id`;
 equal((await command('hold',1)).state,'hold');
 equal((await receipt(concurrent[0].requestId,currentOtherCredential))[0].r.status,'manual_review');
 await assert.rejects(request(id()),/intake approval required|approval required/);n++;
 equal(await db`SELECT * FROM account_deletion_jobs ORDER BY id`,before);equal(await db`SELECT * FROM account_deletion_receipt_access ORDER BY job_id`,receipts);
 // Execution function and request/receipt readers remain byte-for-byte installed contracts.
 for(const f of live.filter(f=>['account_deletion_activation_authorized','request_verified_account_deletion','request_verified_account_deletion_core','read_account_deletion_lifecycle','read_account_deletion_delivered_receipt','claim_account_deletions'].includes(f.proname)))
  equal((await db`SELECT replace(pg_get_functiondef(${('public.'+f.signature)}::regprocedure),E'\r','') definition`)[0].definition,f.definition.replace(/\r/g,''));
 for(const f of live)equal((await db`SELECT proacl::text acl FROM pg_proc WHERE oid=${('public.'+f.signature)}::regprocedure`)[0].acl,f.acl);
 console.log(JSON.stringify({assertions:n,database:'isolated PostgreSQL 17',policy:'30 days from original request; intake only',productionMutations:false}));
}
main().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)').catch(()=>{});await root.end();});
