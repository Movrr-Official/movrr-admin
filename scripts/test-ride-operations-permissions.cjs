// Isolated PostgreSQL only. Reproduce the captured production ACL explicitly;
// fixture default function privileges are broader than this private authority.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const opts={host:'127.0.0.1',port:55439,username:'postgres',password:'isolated-local-test-only',max:4,onnotice:()=>{}};
const root=postgres({...opts,database:'postgres'}),name='movrr_ride_acl_'+process.pid,db=postgres({...opts,database:name});
let n=0;
const equal=(a,b)=>{assert.deepEqual(a,b);n++};
const deny=async fn=>{await assert.rejects(fn,e=>e.code==='42501');n++};
const asRole=(role,fn)=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE '+role);return fn(tx)});
async function main(){
 await root.unsafe('CREATE DATABASE '+name);
 await require('./test-alignment-database.cjs').fixture(db);
 await db.unsafe('REVOKE ALL ON FUNCTION get_ride_reward_read_state(uuid) FROM PUBLIC,anon,authenticated,service_role; GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;');
 const user=crypto.randomUUID(),rider=crypto.randomUUID(),session=crypto.randomUUID(),rejected=crypto.randomUUID();
 await db`INSERT INTO "user"(id,status,role) VALUES(${user},'active','rider')`;
 await db`INSERT INTO rider(id,user_id) VALUES(${rider},${user})`;
 await db`INSERT INTO ride_session(id,rider_id,status,earning_mode,created_at) VALUES(${session},${rider},'completed','standard_ride',now()),(${rejected},${rider},'rejected','standard_ride',now())`;
 const filters={page:0,pageSize:1};
 const page=tx=>tx`SELECT * FROM ops_ride_session_page(${tx.json(filters)})`;
 await deny(()=>asRole('service_role',page));
 const before=(await db`SELECT get_ride_reward_read_state(${session}) state`)[0].state;
 const migration=fs.readFileSync(path.join(__dirname,'064_ride_operations_settlement_read_permission.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
 await db.begin(tx=>tx.unsafe(migration));
 const rows=await asRole('service_role',tx=>tx`SELECT * FROM ops_ride_session_page(${tx.json({page:0,pageSize:200})})`);
 equal(rows.length,2);
 const values=rows.map(r=>r.ops_ride_session_page);
 equal(values.find(r=>r.id===session)._settlement,before);
 equal(values.find(r=>r.id===rejected)._settlement.status,'settled');
 equal((await asRole('service_role',page)).length,1);
 equal((await asRole('service_role',tx=>tx`SELECT * FROM ops_ride_session_page(${tx.json({searchQuery:session,page:0,pageSize:1})})`))[0].ops_ride_session_page.id,session);
 await deny(()=>asRole('anon',page));
 await deny(()=>asRole('authenticated',page));
 await deny(()=>asRole('authenticated',tx=>tx`SELECT get_ride_reward_read_state(${session})`));
 await deny(()=>asRole('anon',tx=>tx`SELECT get_ride_reward_read_state(${session})`));
 // Replay changes no data or result, and owner readers retain the same authority.
 await db.begin(tx=>tx.unsafe(migration));
 equal((await asRole('service_role',tx=>tx`SELECT get_ride_reward_read_state(${session}) state`))[0].state,before);
 equal(Number((await db`SELECT count(*) n FROM ride_session`)[0].n),2);
 equal(Number((await db`SELECT count(*) n FROM reward_transactions`)[0].n),0);
 console.log(JSON.stringify({assertions:n,productionMutations:false,database:'isolated PostgreSQL 17'}));
}
main().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end()});
