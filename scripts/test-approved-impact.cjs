// Isolated PostgreSQL only; never reads production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const opts={host:'127.0.0.1',port:55439,username:'postgres',password:'isolated-local-test-only',max:8,onnotice:()=>{}},root=postgres({...opts,database:'postgres'}),name='movrr_impact_'+process.pid,db=postgres({...opts,database:name});
let n=0;const equal=(a,b)=>{assert.deepEqual(a,b);n++},id=()=>crypto.randomUUID();
const deny=async(fn,code)=>{await assert.rejects(fn,e=>e.code===code);n++};
async function main(){
 await root.unsafe('CREATE DATABASE '+name);await require('./test-alignment-database.cjs').fixture(db);
 await db.begin(tx=>tx.unsafe(fs.readFileSync(path.join(__dirname,'061_approved_impact_methodology.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
 const user=id(),other=id(),rider=id(),foreign=id();
 await db`INSERT INTO "user"(id,status,role) VALUES(${user},'active','rider'),(${other},'active','rider')`;
 await db`INSERT INTO rider(id,user_id) VALUES(${rider},${user}),(${foreign},${other})`;
 const add=async({distance=10000,status='completed',verification='verified',receipt=true,owner=rider,time='2026-03-28T23:30:00Z',mode='standard_ride'}={})=>{const session=id();await db`INSERT INTO ride_session(id,rider_id,status,verification_result,total_distance_meters,completed_at,earning_mode) VALUES(${session},${owner},${status},${db.json({status:verification})},${distance},${time},${mode})`;if(receipt)await db`INSERT INTO ride_reward_execution_receipt(session_id,snapshot_digest) VALUES(${session},'isolated-test')`;return session};
 const standard=await add(),boosted=await add({distance:5000,mode:'ad_enhanced_ride',time:'2026-03-29T22:30:00Z'});
 await add({distance:20});await add({distance:20});
 await add({distance:4000,owner:foreign});
 await add({verification:'pending'});await add({verification:'rejected'});await add({status:'rejected'});await add({status:'active'});await add({receipt:false});
 await add({distance:null});await add({distance:-10});await add({distance:0});await add({distance:'NaN'});await add({distance:'Infinity'});await add({time:null});
 await add({time:'2099-01-01T00:00:00Z'});
 // Multiple bonus rows and incorrect legacy metadata cannot duplicate or supply distance.
 for(const source of ['standard_ride','campaign_ride','free_ride_bonus'])await db`INSERT INTO reward_transactions(id,rider_id,points_earned,source,metadata) VALUES(${id()},${rider},100,${source},${db.json({rideSessionId:standard,totalDistanceKm:9999})})`;
 const get=rid=>db`SELECT * FROM get_impact_summary(${rid})`;
 equal(Number((await get(rider))[0].total_rides),4);
 await db.begin(tx=>tx.unsafe(fs.readFileSync(path.join(__dirname,'062_impact_verified_history_coverage.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
 const own=(await get(rider))[0];equal(Number(own.total_rides),5);equal(Number(own.total_distance_km),25.04);equal(Number(own.co2_saved_kg),4.76);
 equal(Number((await get(foreign))[0].co2_saved_kg),0.76);equal(Number((await get(null))[0].co2_saved_kg),5.52);
 equal((await db`SELECT * FROM get_impact_ride_evidence(${rider}) WHERE session_id=${boosted}`).length,1);
 const days=await db`SELECT (completed_at AT TIME ZONE 'Europe/Amsterdam')::date::text reporting_day,count(*) n FROM get_impact_ride_evidence(${rider}) GROUP BY 1 ORDER BY 1`;
 equal(days.map(x=>[x.reporting_day,Number(x.n)]),[['2026-03-29',4],['2026-03-30',1]]);
 const daily=await db`SELECT * FROM get_impact_daily(366)`;
 equal(daily.map(x=>x.date),['2026-03-29','2026-03-30']);
 equal(daily.map(x=>Number(x.co2SavedKg)),[4.57,0.95]);
 await deny(()=>db`SELECT * FROM get_impact_daily(0)`,'22023');
 const auth=(actor,fn)=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${actor},true),set_config('request.jwt.claims',${JSON.stringify({sub:actor,role:'authenticated'})},true)`;return fn(tx)});
 const me=await auth(user,async tx=>(await tx`SELECT * FROM get_lifetime_impact_summary()`)[0]);equal(me,own);
 equal(Number((await auth(other,async tx=>(await tx`SELECT * FROM get_lifetime_impact_summary()`)[0])).total_distance_km),4);
 await deny(()=>auth(user,tx=>tx`SELECT * FROM get_impact_summary(${foreign})`),'42501');
 await deny(()=>auth(user,tx=>tx`SELECT * FROM get_impact_ride_evidence(${foreign})`),'42501');
 await deny(()=>auth(user,tx=>tx`UPDATE impact_methodology SET factor_kg_co2e_per_vehicle_km=1`),'42501');
 await deny(()=>db`UPDATE impact_methodology SET factor_kg_co2e_per_vehicle_km=0.190`,'42501');
 await deny(()=>db`DELETE FROM impact_methodology`,'42501');
 await db`UPDATE "user" SET status='suspended' WHERE id=${user}`;
 await deny(()=>auth(user,tx=>tx`SELECT * FROM get_lifetime_impact_summary()`),'42501');
 await deny(()=>db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE anon');return tx`SELECT get_impact_methodology()`}),'42501');
 const method=(await db`SELECT get_impact_methodology() m`)[0].m;equal(method.methodologyId,'MOVRR-NL-CAR-COMPARISON-2026-v2');equal(method.factorKgCo2ePerVehicleKm,0.190);equal(method.actualAvoidedEmissions,false);
 equal(Number((await db`SELECT count(*) n FROM reward_transactions`)[0].n),3);equal(Number((await db`SELECT count(*) n FROM rider_badge_award`)[0].n),0);
 equal(Number((await db`SELECT total_distance_meters FROM ride_session WHERE id=${standard}`)[0].total_distance_meters),10000);
 console.log(JSON.stringify({assertions:n,database:'isolated PostgreSQL 17',productionMutations:false}));
}
main().catch(e=>{console.error(e.stack,e.where||'');process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await root.end()});
