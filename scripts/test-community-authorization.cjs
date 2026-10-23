// Local PostgreSQL only. Never loads production credentials or mutates remote data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const opts={host:'127.0.0.1',port:55439,username:'postgres',password:'isolated-local-test-only',max:4,onnotice:()=>{}};
const root=postgres({...opts,database:'postgres'}),name='movrr_community_'+process.pid,db=postgres({...opts,database:name});
let n=0;const id=()=>crypto.randomUUID(),equal=(a,b)=>{assert.deepEqual(a,b);n++},deny=async fn=>{await assert.rejects(fn,e=>e.code==='42501');n++};
const contracts=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/community/production-contracts.json'),'utf8'));
const as=(user,fn,role='authenticated')=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE '+role);await tx`SELECT set_config('request.jwt.claim.sub',${user||''},true),set_config('request.jwt.claim.role',${role},true)`;return fn(tx)});
const payload={title:'Isolated approved ride',scheduledAt:'2099-01-01T12:00:00Z',category:'social',maxParticipants:20};
async function main(){
 await root.unsafe('CREATE DATABASE '+name);
 await require('./test-alignment-database.cjs').fixture(db);
 await db.unsafe(`DROP VIEW auth.users;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz);
 CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
 ALTER TABLE community_ride ENABLE ROW LEVEL SECURITY;ALTER TABLE community_ride_creator_grant ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE ON community_ride,community_ride_creator_grant,community_ride_participant TO authenticated;
 GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT SELECT ON admin_users TO authenticated;
 ALTER TABLE community_ride_participant ADD COLUMN id uuid DEFAULT gen_random_uuid();
 `);
 for(const f of contracts.functions.filter(f=>!f.signature.startsWith('account_deletion_')))await db.unsafe(f.definition);
 // Exact production ride/grant policies, including restrictive policy types.
 for(const p of contracts.policies.filter(p=>p.tablename!=='community_ride_participant')){
   await db.unsafe(`DROP POLICY IF EXISTS "${p.policyname}" ON public.${p.tablename}`);
   await db.unsafe(`CREATE POLICY "${p.policyname}" ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.join(',')} ${p.qual?'USING ('+p.qual+')':''} ${p.with_check?'WITH CHECK ('+p.with_check+')':''}`);
 }
 for(const t of contracts.triggers.filter(t=>!t.definition.includes('account_deletion_')))await db.unsafe(t.definition);
 const approved=id(),rider=id(),other=id(),otherRider=id(),staff=id();
 for(const [user,rid] of [[approved,rider],[other,otherRider]]){
   await db`INSERT INTO auth.users(id) VALUES(${user})`;
   await db`INSERT INTO "user"(id,status,role,name) VALUES(${user},'active','rider','Fixture Rider')`;
   await db`INSERT INTO rider(id,user_id,status) VALUES(${rid},${user},'active')`;
 }
 await db`INSERT INTO community_ride_creator_grant(user_id) VALUES(${approved})`;
 const insert=(user=approved,rid=rider,extra={})=>as(user,tx=>tx`INSERT INTO community_ride ${tx({id:id(),title:'Mobile direct insert',scheduled_at:payload.scheduledAt,category:'social',max_participants:20,organizer_type:'rider',organizer_user_id:user,created_by_user_id:user,organizer_rider_id:rid,organizer_name:'Fixture',status:'upcoming',is_public:true,...extra})} RETURNING id`);
 const rpc=(user,operation=id(),body=payload)=>as(user,async tx=>(await tx`SELECT create_my_community_ride(${operation},${tx.json(body)}) result`)[0].result);
 // Reproduce the existing gap with real captured RLS before candidate migration.
 await db`UPDATE rider SET status='suspended' WHERE id=${rider}`;
 equal((await insert()).length,1);
 await db`UPDATE rider SET status='active' WHERE id=${rider}`;
 const migration=fs.readFileSync(path.join(__dirname,'065_community_approved_rider_authorization.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
 await db.begin(tx=>tx.unsafe(migration));
 await db.begin(tx=>tx.unsafe(migration)); // Safe replay.
 equal((await as(approved,tx=>tx`SELECT can_create_community_ride() allowed`))[0].allowed,true);
 equal((await as(other,tx=>tx`SELECT can_create_community_ride(${approved}) allowed`))[0].allowed,false);
 await deny(()=>as(null,tx=>tx`SELECT can_create_community_ride()`,'anon'));
 const direct=(await insert())[0].id,operation=id(),created=await rpc(approved,operation);
 equal(created.organizer_rider_id,rider);equal((await rpc(approved,operation)).id,created.id);
 equal((await db`SELECT count(*)::int n FROM community_ride_participant WHERE community_ride_id=${created.id} AND rider_id=${rider}`)[0].n,1);
 await deny(()=>insert(other,otherRider));await deny(()=>rpc(other));
 await deny(()=>insert(approved,otherRider));
 await deny(()=>insert(approved,rider,{created_by_user_id:other}));
 await deny(()=>insert(approved,rider,{organizer_type:'movrr'}));
 await deny(()=>as(other,tx=>tx`INSERT INTO community_ride_creator_grant(user_id) VALUES(${other})`));
 await db`INSERT INTO admin_users(user_id,role) VALUES(${other},'admin')`;
 equal((await as(other,tx=>tx`SELECT can_create_community_ride() allowed`))[0].allowed,false);
 await deny(()=>insert(other,otherRider));await deny(()=>rpc(other));
 await db`DELETE FROM admin_users WHERE user_id=${other}`;
 for(const status of ['suspended','inactive']){
   await db`UPDATE rider SET status=${status} WHERE id=${rider}`;
   await deny(()=>insert());await deny(()=>rpc(approved));
   await deny(()=>as(approved,tx=>tx`UPDATE community_ride SET title='Blocked update' WHERE id=${direct}`));
 }
 await db`UPDATE rider SET status='active' WHERE id=${rider}`;
 for(const status of ['suspended','deleted','pending']){
   await db`UPDATE "user" SET status=${status} WHERE id=${approved}`;
   await deny(()=>insert());await deny(()=>rpc(approved));await deny(()=>rpc(approved,operation));
 }
 await db`UPDATE "user" SET status='active',deleted_at=now() WHERE id=${approved}`;
 await deny(()=>insert());await deny(()=>rpc(approved));
 await db`UPDATE "user" SET deleted_at=NULL WHERE id=${approved}`;
 await db`UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=${approved}`;
 await deny(()=>insert());await deny(()=>rpc(approved));
 await db`UPDATE auth.users SET banned_until=NULL,deleted_at=now() WHERE id=${approved}`;
 await deny(()=>insert());await deny(()=>rpc(approved));
 await db`UPDATE auth.users SET deleted_at=NULL WHERE id=${approved}`;
 await db`UPDATE community_ride_creator_grant SET revoked_at=now() WHERE user_id=${approved}`;
 await deny(()=>insert());await deny(()=>rpc(approved));await deny(()=>rpc(approved,operation));
 // Approval revocation blocks creation, while active owners retain legitimate edits.
 equal((await as(approved,tx=>tx`UPDATE community_ride SET title='Owner edit' WHERE id=${direct} RETURNING title`))[0].title,'Owner edit');
 const edit=(user,ride=created.id)=>as(user,tx=>tx`SELECT * FROM update_community_ride(${ride},NULL,'Owner RPC edit','Description','2099-01-01T12:00:00Z'::timestamptz,'Station','social',20)`);
 equal((await edit(approved))[0].success,true);
 equal((await edit(other))[0].error_code,'not_organiser');
 equal((await as(other,tx=>tx`UPDATE community_ride SET title='Cross account' WHERE id=${direct} RETURNING id`)).length,0);
 await deny(()=>as(approved,tx=>tx`UPDATE community_ride SET organizer_rider_id=${otherRider} WHERE id=${direct}`));
 await db`UPDATE rider SET status='suspended' WHERE id=${rider}`;
 await deny(()=>edit(approved));
 await db`UPDATE rider SET status='active' WHERE id=${rider}`;
 // Unapproved active riders still discover and participate using the canonical RPC.
 equal((await as(other,tx=>tx`SELECT id FROM community_ride WHERE id=${direct}`)).length,1);
 const joined=await as(other,tx=>tx`SELECT join_community_ride(${direct},${otherRider}) result`);
 equal(joined[0].result.success,true);
 equal((await as(other,tx=>tx`SELECT join_community_ride(${direct},${rider}) result`))[0].result.success,false);
 equal((await as(other,tx=>tx`SELECT leave_community_ride(${direct},${otherRider}) result`))[0].result.success,true);
 equal((await db`SELECT count(*)::int n FROM community_ride`)[0].n,3);
 equal((await db`SELECT count(*)::int n FROM reward_transactions`)[0].n,0);
 // Existing official staff creation stays available; staff cannot label an unapproved rider as approved.
 await as(null,tx=>tx`INSERT INTO community_ride(id,title,organizer_type,organizer_name,status,is_public) VALUES(${id()},'Official ride','movrr','MOVRR','upcoming',true)`,'service_role');
 await deny(()=>as(null,tx=>tx`INSERT INTO community_ride(id,title,organizer_type,organizer_user_id,organizer_rider_id,organizer_name) VALUES(${id()},'Unapproved delegated ride','rider',${other},${otherRider},'Fixture')`,'service_role'));
 const participantsBefore=(await db`SELECT count(*)::int n FROM community_ride_participant`)[0].n;
 const rollback=fs.readFileSync(path.join(__dirname,'manual/community-approval/rollback.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
 await db.begin(tx=>tx.unsafe(rollback));
 equal((await as(other,tx=>tx`SELECT can_create_community_ride(${approved}) allowed`))[0].allowed,false);
 await db.begin(tx=>tx.unsafe(migration));
 equal((await db`SELECT count(*)::int n FROM community_ride`)[0].n,4);
 equal((await db`SELECT count(*)::int n FROM community_ride_participant`)[0].n,participantsBefore);
 const httpAssertions=process.argv.includes('--http')?await require('./test-community-http.cjs')({db,approved,rider,other,otherRider}):0;
 console.log(JSON.stringify({assertions:n,httpAssertions,baselineSuspendedRiderBypassReproduced:true,source:'captured production functions/policies plus isolated PostgreSQL 17',productionMutations:false}));
}
main().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end()});
