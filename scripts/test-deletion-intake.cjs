// Real, isolated PostgreSQL 17. Never reads .env or connects to production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const options={host:'127.0.0.1',port:55439,username:'postgres',password:'isolated-local-test-only',max:8,onnotice:()=>{}};
const root=postgres({...options,database:'postgres'}),name='movrr_intake_'+process.pid,db=postgres({...options,database:name});
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++},deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);count++},id=()=>crypto.randomUUID();
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
async function main(){
 await root.unsafe('CREATE DATABASE '+name);
 // Installs the exact ordered 055,093,056,057,058,059 chain, not duplicates of it.
 await require('./test-alignment-database.cjs').fixture(db);
 await db.unsafe(`CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE account_deletion_policy_version(version integer PRIMARY KEY,technical_status text);
 CREATE TABLE account_deletion_action_rule(policy_version integer,scope text,technical_status text,legal_status text,finance_status text,partner_status text,approval_reference text);
 CREATE TABLE account_deletion_contract_gate(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),requests_enabled boolean NOT NULL DEFAULT false,catalog_digest text,catalog_verified_at timestamptz,catalog_review_reference text,barrier_verified_at timestamptz,disposition_verified_at timestamptz,active_policy_version integer NOT NULL DEFAULT 1 REFERENCES account_deletion_policy_version,CHECK(NOT requests_enabled OR(catalog_digest IS NOT NULL AND catalog_verified_at IS NOT NULL AND catalog_review_reference IS NOT NULL AND barrier_verified_at IS NOT NULL AND disposition_verified_at IS NOT NULL)));
 ALTER TABLE account_deletion_jobs ADD UNIQUE(user_id);
 CREATE TABLE account_deletion_write_guard(user_id uuid PRIMARY KEY,restricted boolean DEFAULT false,job_id uuid,changed_at timestamptz DEFAULT now());
 CREATE TABLE account_deletion_audit(job_id uuid,actor_user_id uuid,event_code text,created_at timestamptz DEFAULT now());
 CREATE TABLE account_deletion_retention_rule(policy_version integer,category text,approval_status text,period interval,lawful_basis text,start_event text,minimum_fields text[]);
 CREATE TABLE account_deletion_receipt_access(job_id uuid PRIMARY KEY,token_digest bytea,expires_at timestamptz);
 INSERT INTO account_deletion_policy_version VALUES(1,'approved');INSERT INTO account_deletion_contract_gate(singleton) VALUES(true);`);
 await db.unsafe(read('fixtures/deletion-intake/production-functions.sql'));
 // Fixture default grants are intentionally permissive, as in Supabase; restore actual private ACLs.
 await db.unsafe(`REVOKE ALL ON FUNCTION account_deletion_rule_allowed(integer,text),establish_account_deletion_barrier(uuid,integer,boolean),request_verified_account_deletion_core(uuid,integer,boolean),request_verified_account_deletion(uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION request_verified_account_deletion(uuid,integer,boolean) TO service_role;`);
 await db.begin(tx=>tx.unsafe(read('060_account_deletion_intake_control.sql').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
 const security=id(),support=id(),ops=id(),rider=id(),other=id();
 for(const u of [security,support,ops,rider,other]){
  await db`INSERT INTO "user"(id,email,status,role) VALUES(${u},${u+'@isolated.invalid'},'active','rider')`;
  await db`INSERT INTO auth.users VALUES(${u})`;
 }
 await db`INSERT INTO admin_users VALUES(${security},'security_admin'),(${support},'support_agent'),(${ops},'operations_manager')`;
 // The inspected SQL wrapper must migrate successfully and delegate unchanged.
 await db.unsafe(`CREATE FUNCTION public.execute_ride_time_settlement(p_session uuid,p_token uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('session',p_session,'token',p_token) $$;`);
 const session=(actor,fn,aal='aal2')=>db.begin(async tx=>{
  await tx.unsafe('SET LOCAL ROLE authenticated');
  await tx`SELECT set_config('request.jwt.claim.sub',${actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:actor,role:'authenticated',aal})},true)`;
  return fn(tx);
 });
 const status=actor=>session(actor,async tx=>(await tx`SELECT account_deletion_intake_status() r`)[0].r);
 const command=(actor,state,version,operation=id(),reason='Reviewed operational change',aal='aal2')=>session(actor,async tx=>(await tx`SELECT set_account_deletion_intake(${state},${version},${reason},${operation}) r`)[0].r,aal);
 const token=id(),ride=id();
 eq(await session(rider,async tx=>(await tx`SELECT execute_my_ride_time_settlement(${ride},${token}) r`)[0].r),{session:ride,token});
 await db`UPDATE "user" SET status='suspended' WHERE id=${rider}`;
 await deny(()=>session(rider,tx=>tx`SELECT execute_my_ride_time_settlement(${ride},${token})`),'42501');
 await db`UPDATE "user" SET status='active' WHERE id=${rider}`;
 await deny(()=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE anon');return tx`SELECT execute_my_ride_time_settlement(${ride},${token})`;}),'42501');
 eq((await status(support)).state,'disabled');eq((await status(security)).requestsEnabled,false);
 for(const actor of [support,ops,rider])await deny(()=>command(actor,'enabled',0),'42501');
 await deny(()=>command(security,'hold',0,id(),'Reviewed operational change','aal1'),'42501');
 await db`UPDATE "user" SET status='suspended' WHERE id=${security}`;
 await deny(()=>command(security,'hold',0),'42501');
 await db`UPDATE "user" SET status='active' WHERE id=${security}`;
 await deny(()=>command(security,'enabled',0),'55000');eq((await status(security)).version,0);
 await deny(()=>session(security,tx=>tx`UPDATE account_deletion_contract_gate SET operating_state='enabled'`),'42501');
 await deny(()=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');await tx`UPDATE account_deletion_contract_gate SET operating_state='enabled'`;}),'42501');
 await assert.rejects(db`SELECT request_verified_account_deletion(${rider},1,true)`,/approval required/);count++;
 eq(Number((await db`SELECT count(*) n FROM account_deletion_jobs`)[0].n),0);
 const replay=id(),first=await command(security,'hold',0,replay);
 eq(await command(security,'hold',0,replay),first);
 await deny(()=>command(security,'disabled',0,replay),'22023');
 eq(Number((await db`SELECT count(*) n FROM platform_audit_record WHERE capability='settings.security'`)[0].n),1);
 const races=await Promise.allSettled([command(security,'disabled',1),command(security,'hold',1)]);
 eq(races.filter(r=>r.status==='fulfilled').length,1);eq(races.filter(r=>r.status==='rejected'&&r.reason.code==='40001').length,1);
 // Test-only policy evidence. The production gate remains unchanged and disabled.
 await db.unsafe(`UPDATE account_deletion_contract_gate SET catalog_digest='ISOLATED TEST',catalog_verified_at=now(),catalog_review_reference='ISOLATED TEST',barrier_verified_at=now(),disposition_verified_at=now();
 INSERT INTO account_deletion_action_rule SELECT 1,s,'approved','approved','not_required','not_required','ISOLATED TEST' FROM unnest(ARRAY['personal.erase','external.erase','receipt.complete','restore.suppress','receipt.delivery']) s;
 INSERT INTO account_deletion_retention_rule VALUES(1,'receipt_access','approved',interval '1 day','ISOLATED TEST','barrier_established',ARRAY['token_digest','expires_at']);`);
 const enabled=await command(security,'enabled',2);eq(enabled.requestsEnabled,true);
 const accepted=(await db`SELECT request_verified_account_deletion(${rider},1,true) r`)[0].r;
 eq(accepted.status,'restricted');eq(accepted.receiptAccess.credential.length,64);
 const receipt=await db`SELECT * FROM account_deletion_receipt_access`,jobs=await db`SELECT id,user_id,status,stage FROM account_deletion_jobs`;
 // An in-flight accepted request holds a share lock; the hold cannot overtake it.
 let locked,release;const reached=new Promise(r=>locked=r),unblock=new Promise(r=>release=r);
 const request=db.begin(async tx=>{const r=await tx`SELECT request_verified_account_deletion(${other},1,true) r`;locked();await unblock;return r;});
 await reached;let holdFinished=false;const holding=command(security,'hold',3).then(r=>{holdFinished=true;return r});
 const waiter=await db`SELECT count(*) n FROM pg_stat_activity WHERE datname=${name} AND wait_event_type='Lock'`;
 // Wait on observable database state rather than relying on a performance deadline.
 for(let i=0;Number(waiter[0].n)===0&&i<100;i++){const w=await db`SELECT count(*) n FROM pg_stat_activity WHERE datname=${name} AND wait_event_type='Lock'`;if(Number(w[0].n)>0)break;if(i===99)throw Error('Hold did not wait on request');}
 eq(holdFinished,false);release();await request;eq((await holding).state,'hold');
 await assert.rejects(db`SELECT request_verified_account_deletion(${id()},1,true)`,/approval required/);count++;
 eq(await db`SELECT * FROM account_deletion_receipt_access WHERE job_id=${accepted.requestId}`,receipt);
 eq(await db`SELECT id,user_id,status,stage FROM account_deletion_jobs WHERE id=${accepted.requestId}`,jobs);
 eq((await db`SELECT restricted FROM account_deletion_write_guard WHERE user_id=${rider}`)[0].restricted,true);
 const audit=(await db`SELECT previous_state,resulting_state,reason,actor_user_id,created_at FROM platform_audit_record ORDER BY created_at DESC LIMIT 1`)[0];
 eq(audit.actor_user_id,security);eq(audit.previous_state.version,3);eq(audit.resulting_state.version,4);eq(audit.resulting_state.state,'hold');
 // Interrupted transaction rolls back state, audit and receipt together.
 const before=await status(security),interrupted=id();
 await assert.rejects(session(security,async tx=>{await tx`SELECT set_account_deletion_intake('disabled',4,'Interruption rollback test',${interrupted})`;throw Error('simulated interruption')}),/interruption/);count++;
 eq(await status(security),before);eq(Number((await db`SELECT count(*) n FROM ops_command_receipt WHERE operation=${interrupted}`)[0].n),0);
 const retry=id();const duplicates=await Promise.all([command(security,'disabled',4,retry),command(security,'disabled',4,retry)]);
 eq(duplicates[0],duplicates[1]);eq(duplicates[0].version,5);
 eq(Number((await db`SELECT count(*) n FROM platform_audit_record WHERE correlation_id=${retry}`)[0].n),1);
 await deny(()=>status(rider),'42501');
 await deny(()=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE anon');return tx`SELECT account_deletion_intake_status()`;}),'42501');
 // A different SQL body must stop installation rather than being silently replaced.
 const acl=(await db`SELECT proacl::text acl FROM pg_proc WHERE oid='public.execute_my_ride_time_settlement(uuid,uuid)'::regprocedure`)[0].acl;
 const guards=read('055_alignment_security.sql').match(/DO \$guards\$[\s\S]*?END \$guards\$;/)[0];
 await db.unsafe(`CREATE OR REPLACE FUNCTION public.execute_my_ride_time_settlement(p_session uuid,p_token uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.execute_ride_time_settlement(p_session,p_token) WHERE false; $$;`);
 await deny(()=>db.unsafe(guards),'P0001');
 await db.unsafe(`CREATE OR REPLACE FUNCTION public.execute_my_ride_time_settlement(p_session uuid,p_token uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.execute_ride_time_settlement(p_session,p_token); $$;`);
 await db.unsafe(guards);
 eq((await db`SELECT proacl::text acl FROM pg_proc WHERE oid='public.execute_my_ride_time_settlement(uuid,uuid)'::regprocedure`)[0].acl,acl);
 console.log(JSON.stringify({assertions:count,database:'PostgreSQL 17 localhost',migrationChain:'055,093,056,057,058,059,060',productionMutations:false}));
}
main().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await root.end()});
