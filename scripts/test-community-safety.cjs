// Real isolated PostgreSQL 17. Synthetic fixture only, no .env or remote connection.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const postgres = require('postgres');
const options = { host: '127.0.0.1', port: 55439, username: 'postgres', password: 'isolated-local-test-only', max: 8, onnotice() {} };
const root = postgres({ ...options, database: 'postgres' }), name = 'movrr_safety_' + process.pid, db = postgres({ ...options, database: name });
const id = () => crypto.randomUUID(); let assertions = 0;
const equal = (a,b) => { assert.deepEqual(a,b); assertions++; };
const deny = async (fn, code = '42501') => { await assert.rejects(fn, e => e.code === code); assertions++; };
const as = (user, fn, role = 'authenticated') => db.begin(async tx => {
  await tx.unsafe('SET LOCAL ROLE ' + role);
  await tx`SELECT set_config('request.jwt.claim.sub',${user ?? ''},true),set_config('request.jwt.claim.role',${role},true)`;
  return fn(tx);
});
const admin = id(), owner = id(), organiser = id(), reporter = id(), rider = id(), outsider = id(), third = id();
const rideInput = { title: 'Canal ride', description: 'A relaxed ride together', organizer_type: 'rider', organizer_name: 'Organiser', organizer_user_id: owner, organizer_rider_id: organiser, created_by_user_id: owner, is_public: true, status: 'upcoming', scheduled_at: '2099-01-01T12:00:00Z', max_participants: 20, category: 'social' };
const create = (extra = {}) => as(owner, async tx => (await tx`INSERT INTO community_ride ${tx({ id: id(), ...rideInput, ...extra })} RETURNING *`)[0]);
const review = (ride, action = 'approve', report = null, operation = id(), reason = 'Reviewed all text and image against Community Guidelines') => as(null, tx => tx`SELECT moderate_community_content(${operation},${admin},${ride.id},${ride.moderation_version},${action},${reason},${report?.id ?? null},${report?.version ?? null})`, 'service_role');
const report = (ride, target = 'ride', user = reporter) => as(user, async tx => (await tx`SELECT report_community_content(${ride.id},${target},'harassment','Please review') id`)[0].id);
let storage;
async function main() {
  await root.unsafe('CREATE DATABASE ' + name);
  await require('./test-alignment-database.cjs').fixture(db);
  if(process.argv.includes('--storage')) storage=await require('./test-community-safety-storage.cjs')(db);
  await db.unsafe(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
    ${storage?"INSERT INTO storage.buckets(id,name,public) VALUES('community-rides','community-rides',true);":"CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean); INSERT INTO storage.buckets VALUES('community-rides',true); CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,UNIQUE(bucket_id,name));"}
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    CREATE POLICY existing_owner_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='community-rides' AND split_part(name,'/',1)=auth.uid()::text);
    CREATE POLICY existing_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='community-rides' AND split_part(name,'/',1)=auth.uid()::text);
    CREATE POLICY existing_owner_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='community-rides' AND split_part(name,'/',1)=auth.uid()::text);
    CREATE POLICY existing_owner_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='community-rides' AND split_part(name,'/',1)=auth.uid()::text);
    ALTER TABLE community_ride ENABLE ROW LEVEL SECURITY; ALTER TABLE community_ride_participant ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE ON community_ride,community_ride_participant TO authenticated; GRANT SELECT ON community_ride,community_ride_participant TO anon;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT SELECT ON admin_users TO authenticated;`);
  const captured=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/community/production-contracts.json'),'utf8'));
  await db.unsafe(fs.readFileSync(path.join(__dirname,'fixtures/community/participant-read.sql'),'utf8'));
  // Use the actual permissive AND restrictive Community policies. A permissive
  // synthetic replacement cannot establish compatibility with deployed RLS.
  for(const policy of captured.policies) {
    await db.unsafe(`DROP POLICY IF EXISTS "${policy.policyname}" ON public.${policy.tablename}`);
    await db.unsafe(`CREATE POLICY "${policy.policyname}" ON public.${policy.tablename} AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.join(',')} ${policy.qual?'USING ('+policy.qual+')':''} ${policy.with_check?'WITH CHECK ('+policy.with_check+')':''}`);
  }
  await db.begin(tx=>tx.unsafe(fs.readFileSync(path.join(__dirname,'065_community_approved_rider_authorization.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
  await db.unsafe(`CREATE TABLE community_ride_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),community_ride_id uuid,inviter_rider_id uuid,invite_code text,source_screen text,expires_at timestamptz,UNIQUE(community_ride_id,inviter_rider_id));`);
  const referralSource=fs.readFileSync(path.join(__dirname,'../../movrr-mobile/scripts/017_referral_tables.sql'),'utf8');
  for(const fn of ['create_or_get_community_ride_invite','resolve_invite_code']) {
    const start=referralSource.indexOf('CREATE OR REPLACE FUNCTION public.'+fn+'(');
    await db.unsafe(referralSource.slice(start,referralSource.indexOf('$$;',start)+3));
  }
  for(const fn of captured.functions.filter(f=>['community_ride_enrol_organizer()','set_community_ride_updated_at()','enforce_community_ride_status_transition()'].includes(f.signature))) await db.unsafe(fn.definition);
  for(const trigger of captured.triggers.filter(t=>!t.definition.includes('account_deletion'))) await db.unsafe(trigger.definition);
  for (const [user,rid] of [[owner,organiser],[reporter,rider],[outsider,third]]) {
    await db`INSERT INTO "user"(id,status,role,name) VALUES(${user},'active','rider','Synthetic')`;
    await db`INSERT INTO rider(id,user_id,status) VALUES(${rid},${user},'active')`;
  }
  await db`INSERT INTO community_ride_creator_grant(user_id) VALUES(${owner})`;
  const existing=await create({cover_image_url:'https://isolated.invalid/storage/v1/object/public/community-rides/existing.png'});
  const participantBefore=(await db`SELECT rider_id,status,joined_at FROM community_ride_participant WHERE community_ride_id=${existing.id}`)[0];
  const existingCover=storage?await storage.seedExisting({owner,ride:existing,as}):null;
  await db.begin(tx=>tx.unsafe(fs.readFileSync(path.join(__dirname,'082_community_safety.sql'),'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')));
  const retainedExisting=(await db`SELECT * FROM community_ride WHERE id=${existing.id}`)[0];
  equal(retainedExisting.title,existing.title);equal(retainedExisting.cover_image_url,null);equal(retainedExisting.moderation_state,'approved');
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride WHERE id=${existing.id}`)).length,1);
  equal((await db`SELECT rider_id,status,joined_at FROM community_ride_participant WHERE community_ride_id=${existing.id}`)[0],participantBefore);
  if(storage)await storage.verifyExisting({viewer:reporter,fixture:existingCover});
  // Remove only this synthetic fixture after proving migration preservation.
  await db`DELETE FROM community_ride_participant WHERE community_ride_id=${existing.id}`;
  await db`DELETE FROM community_ride WHERE id=${existing.id}`;
  const c = await create(); equal(c.moderation_state,'pending');
  await deny(()=>as(owner,tx=>tx`SELECT create_or_get_community_ride_invite(${organiser},${c.id},'test')`));
  equal((await as(reporter,tx=>tx`SELECT * FROM community_ride`)).length,0);
  equal((await as(owner,tx=>tx`SELECT * FROM community_ride`)).length,1);
  await deny(()=>as(reporter,tx=>tx`SELECT join_community_ride(${c.id},${rider})`));
  await deny(()=>as(owner,tx=>tx`UPDATE community_ride SET moderation_state='approved' WHERE id=${c.id}`));
  await deny(()=>as(owner,tx=>tx`SELECT moderate_community_content(${id()},${admin},${c.id},1,'approve','Forged staff',NULL,NULL)`));
  await review(c);
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride`)).length,1);
  equal((await as(reporter,tx=>tx`SELECT join_community_ride(${c.id},${rider}) result`))[0].result.success,true);
  const invite=(await as(owner,tx=>tx`SELECT create_or_get_community_ride_invite(${organiser},${c.id},'test') code`))[0].code;
  equal((await as(reporter,tx=>tx`SELECT resolve_invite_code(${invite}) result`))[0].result.valid,true);
  const reportId = await report(c); equal(await report(c),reportId);
  await deny(()=>as(null,tx=>tx`SELECT report_community_content(${c.id},'ride','hate','')`,'anon'));
  await deny(()=>as(reporter,tx=>tx`SELECT * FROM community_report`));
  await deny(()=>as(owner,tx=>tx`SELECT * FROM community_report`));
  await deny(()=>as(reporter,tx=>tx`INSERT INTO community_report(reporter_user_id) VALUES(${reporter})`));
  await deny(()=>as(reporter,tx=>tx`SELECT set_community_block(${rider},true)`),'22023');
  const commitmentBefore=(await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} AND rider_id=${rider}`)[0];
  const rosterBefore=await as(reporter,tx=>tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} ORDER BY rider_id`);
  const notificationsBefore=(await db`SELECT count(*)::int n FROM notifications`)[0].n;
  await as(reporter,tx=>tx`SELECT set_community_block(${organiser},true)`);
  await as(reporter,tx=>tx`SELECT set_community_block(${organiser},true)`);
  equal((await as(reporter,tx=>tx`SELECT * FROM my_community_blocks()`)).length,1);
  equal((await as(outsider,tx=>tx`SELECT * FROM my_community_blocks()`)).length,0);
  await deny(()=>as(outsider,tx=>tx`SELECT community_pair_blocked(${rider},${organiser})`));
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride`)).length,1);
  equal((await as(reporter,tx=>tx`SELECT resolve_invite_code(${invite}) result`))[0].result.valid,true);
  equal((await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} AND rider_id=${rider}`)[0],commitmentBefore);
  equal(await as(reporter,tx=>tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} ORDER BY rider_id`),rosterBefore);
  equal((await db`SELECT count(*)::int n FROM notifications`)[0].n,notificationsBefore);
  await deny(()=>as(reporter,tx=>tx`SELECT create_or_get_community_ride_invite(${rider},${c.id},'blocked')`));
  const unshared=await create(); await review(unshared);
  const storedInvite=(await as(owner,tx=>tx`SELECT create_or_get_community_ride_invite(${organiser},${unshared.id},'existing') code`))[0].code;
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride WHERE id=${unshared.id}`)).length,0);
  equal((await as(reporter,tx=>tx`SELECT resolve_invite_code(${storedInvite}) result`))[0].result.valid,false);
  await deny(()=>as(reporter,tx=>tx`SELECT join_community_ride(${unshared.id},${rider})`));
  await deny(()=>as(reporter,tx=>tx`INSERT INTO community_ride_participant(community_ride_id,rider_id,status) VALUES(${unshared.id},${rider},'joined')`));
  equal((await db`SELECT invite_code FROM community_ride_invites WHERE community_ride_id=${unshared.id}`)[0].invite_code,storedInvite);
  // An organiser's reverse block must also preserve every commitment and count.
  await as(owner,tx=>tx`SELECT set_community_block(${rider},true)`);
  equal((await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} AND rider_id=${rider}`)[0],commitmentBefore);
  equal(await as(owner,tx=>tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} ORDER BY rider_id`),rosterBefore);
  await as(owner,tx=>tx`SELECT set_community_block(${rider},false)`);
  await deny(()=>as(reporter,tx=>tx`SELECT join_community_ride(${c.id},${rider})`));
  equal((await as(outsider,tx=>tx`SELECT join_community_ride(${c.id},${third}) result`))[0].result.success,true);
  await as(reporter,tx=>tx`SELECT set_community_block(${organiser},false)`);
  equal((await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${c.id} AND rider_id=${rider}`)[0],commitmentBefore);
  equal((await db`SELECT count(*)::int n FROM community_ride_participant WHERE community_ride_id=${unshared.id} AND rider_id=${rider}`)[0].n,0);
  equal((await as(reporter,tx=>tx`SELECT join_community_ride(${c.id},${rider}) result`))[0].result.success,true);
  // Allowed text, prohibited text, uncertainty and no reviewer all stay private until an explicit decision.
  for (const title of ['City coffee ride','[synthetic prohibited text fixture]','[synthetic uncertain fixture]','[review unavailable fixture]']) {
    const candidate = await create({title});
    equal((await as(reporter,tx=>tx`SELECT id FROM community_ride WHERE id=${candidate.id}`)).length,0);
    if(title==='City coffee ride') await review(candidate); else if(title.includes('prohibited')) await review(candidate,'restrict');
  }
  const orphanRide=await create(), orphanPath=`${owner}/${orphanRide.id}/${id()}.png`;
  await as(owner,tx=>tx`INSERT INTO storage.objects(bucket_id,name) VALUES('community-rides',${orphanPath})`);
  equal((await as(owner,async tx=>{
    // The real Storage service uses this transaction flag for its own deletes.
    // This metadata-only fixture has no bytes; real API deletion is tested below.
    if(storage)await tx`SELECT set_config('storage.allow_delete_query','true',true)`;
    return tx`DELETE FROM storage.objects WHERE name=${orphanPath} RETURNING name`;
  })).length,1);
  const concurrentRide=await create(); await review(concurrentRide);
  await Promise.allSettled([
    as(outsider,tx=>tx`SELECT join_community_ride(${concurrentRide.id},${third})`),
    as(outsider,tx=>tx`SELECT set_community_block(${organiser},true)`),
  ]);
  // Whichever operation commits first wins. A successful pre-block join is a
  // commitment; a join after the block must fail without rewriting that row.
  const racedParticipation=await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${concurrentRide.id} AND rider_id=${third}`;
  await deny(()=>as(outsider,tx=>tx`SELECT join_community_ride(${concurrentRide.id},${third})`));
  equal(await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${concurrentRide.id} AND rider_id=${third}`,racedParticipation);
  await as(outsider,tx=>tx`SELECT set_community_block(${organiser},false)`);
  const imageRide = await create(); const cover = `${owner}/${imageRide.id}/${id()}.png`;
  await as(owner,tx=>tx`INSERT INTO storage.objects(bucket_id,name) VALUES('community-rides',${cover})`);
  await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${cover},cover_image_url='https://untrusted.invalid/image' WHERE id=${imageRide.id}`);
  equal((await db`SELECT cover_image_url FROM community_ride WHERE id=${imageRide.id}`)[0].cover_image_url,null);
  equal((await as(reporter,tx=>tx`SELECT * FROM storage.objects WHERE name=${cover}`)).length,0);
  equal((await as(owner,tx=>tx`SELECT * FROM storage.objects WHERE name=${cover}`)).length,1);
  equal((await db`SELECT public FROM storage.buckets WHERE id='community-rides'`)[0].public,false);
  equal((await as(owner,tx=>tx`UPDATE storage.objects SET name=${cover+'.replacement'} WHERE name=${cover} RETURNING name`)).length,0);
  const img = (await db`SELECT * FROM community_ride WHERE id=${imageRide.id}`)[0];
  await review(img); equal((await as(reporter,tx=>tx`SELECT * FROM storage.objects WHERE name=${cover}`)).length,1);
  const imgReport = await report(img,'image');
  // Replacement is a new immutable private image and revokes publication immediately.
  const replacement = `${owner}/${imageRide.id}/${id()}.png`;
  await as(owner,tx=>tx`INSERT INTO storage.objects(bucket_id,name) VALUES('community-rides',${replacement})`);
  await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${replacement} WHERE id=${imageRide.id}`);
  equal((await as(reporter,tx=>tx`SELECT * FROM storage.objects WHERE name IN (${cover},${replacement})`)).length,0);
  await deny(()=>as(null,tx=>tx`DELETE FROM storage.objects WHERE name=${cover}`,'service_role'));
  // Rejected image remains private after human review; no simulated image classifier.
  await review((await db`SELECT * FROM community_ride WHERE id=${imageRide.id}`)[0],'restrict');
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride WHERE id=${imageRide.id}`)).length,0);
  await deny(()=>as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${'other/'+id()+'/x.png'} WHERE id=${c.id}`),'22023');
  const current = (await db`SELECT * FROM community_ride WHERE id=${c.id}`)[0], r = (await db`SELECT * FROM community_report WHERE id=${reportId}`)[0];
  const op=id(); await review(current,'dismiss',r,op); await review(current,'dismiss',r,op);
  equal((await db`SELECT count(*)::int n FROM community_moderation_audit WHERE operation_id=${op}`)[0].n,1);
  await deny(()=>review(current,'remove',r),'40001');
  const another = await report(c,'text',outsider), rr = (await db`SELECT * FROM community_report WHERE id=${another}`)[0];
  const race = await Promise.allSettled([review(current,'remove',rr),review(current,'dismiss',rr)]);
  equal(race.filter(x=>x.status==='fulfilled').length,1);
  equal((await db`SELECT count(*)::int n FROM community_moderation_audit WHERE report_id=${another}`)[0].n,1);
  const revised=await create();await review(revised);const firstReport=await report(revised,'ride',outsider);
  await as(owner,tx=>tx`UPDATE community_ride SET title='Revised non-offensive fixture' WHERE id=${revised.id}`);
  await review((await db`SELECT * FROM community_ride WHERE id=${revised.id}`)[0]);
  const revisedReport=await report(revised,'ride',outsider);equal(firstReport===revisedReport,false);
  // Historical participation survives a new block.
  const history=await create();await review(history);
  await as(outsider,tx=>tx`SELECT join_community_ride(${history.id},${third})`);
  await as(null,tx=>tx`UPDATE community_ride SET status='active' WHERE id=${history.id}`,'service_role');
  await as(null,tx=>tx`UPDATE community_ride SET status='completed' WHERE id=${history.id}`,'service_role');
  await as(outsider,tx=>tx`SELECT set_community_block(${organiser},true)`);
  equal((await db`SELECT status FROM community_ride_participant WHERE community_ride_id=${history.id} AND rider_id=${third}`)[0].status,'joined');
  equal((await as(outsider,tx=>tx`SELECT id FROM community_ride WHERE id=${history.id}`)).length,1);
  equal((await as(outsider,tx=>tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${history.id}`)).length,2);
  await as(outsider,tx=>tx`SELECT set_community_block(${organiser},false)`);
  // MOVRR/Admin identities cannot be blocked as organisers. Even a linked
  // rider's individual block must not hide or end participation in platform rides.
  const platformUser=id(),platformRider=id();
  await db`INSERT INTO "user"(id,status,role,name) VALUES(${platformUser},'active','rider','Synthetic platform fixture')`;
  await db`INSERT INTO rider(id,user_id,status) VALUES(${platformRider},${platformUser},'active')`;
  for(const organizerType of ['movrr','admin']) {
    const platform=await as(null,async tx=>(await tx`INSERT INTO community_ride ${tx({id:id(),...rideInput,organizer_type:organizerType,organizer_name:'MOVRR',organizer_user_id:platformUser,organizer_rider_id:platformRider})} RETURNING *`)[0],'service_role');
    await review(platform);
    await deny(()=>as(outsider,tx=>tx`SELECT set_community_block(${platformRider},true)`));
    await as(outsider,tx=>tx`SELECT join_community_ride(${platform.id},${third})`);
    await as(null,tx=>tx`UPDATE community_ride SET organizer_rider_id=${organiser} WHERE id=${platform.id}`,'service_role');
    await as(outsider,tx=>tx`SELECT set_community_block(${organiser},true)`);
    equal((await as(outsider,tx=>tx`SELECT id FROM community_ride WHERE id=${platform.id}`)).length,1);
    equal((await db`SELECT status FROM community_ride_participant WHERE community_ride_id=${platform.id} AND rider_id=${third}`)[0].status,'joined');
    equal((await as(outsider,tx=>tx`SELECT join_community_ride(${platform.id},${third}) result`))[0].result.success,true);
    await as(outsider,tx=>tx`SELECT set_community_block(${organiser},false)`);
  }
  // Existing canonical create/edit/leave/cancel RPCs remain usable after 082.
  const createdByRpc=(await as(owner,tx=>tx`SELECT create_my_community_ride(${id()},${tx.json({title:'RPC canal ride',scheduledAt:'2099-02-01T10:00:00Z',category:'social',maxParticipants:20})}) result`))[0].result;
  let rpcRide=(await db`SELECT * FROM community_ride WHERE id=${createdByRpc.id}`)[0];
  equal(rpcRide.moderation_state,'pending');
  equal((await db`SELECT count(*)::int n FROM community_ride_participant WHERE community_ride_id=${rpcRide.id}`)[0].n,1);
  await review(rpcRide);
  equal((await as(reporter,tx=>tx`SELECT join_community_ride(${rpcRide.id},${rider}) result`))[0].result.success,true);
  const edited=await as(owner,tx=>tx`SELECT * FROM update_community_ride(${rpcRide.id},NULL,'RPC revised ride','Revised description','2099-02-02T10:00:00Z'::timestamptz,'Public station','social',20)`);
  equal(edited[0].success,true);
  rpcRide=(await db`SELECT * FROM community_ride WHERE id=${rpcRide.id}`)[0];
  equal(rpcRide.moderation_state,'pending');
  equal((await as(reporter,tx=>tx`SELECT id FROM community_ride WHERE id=${rpcRide.id}`)).length,0);
  await review(rpcRide);
  await as(reporter,tx=>tx`SELECT set_community_block(${organiser},true)`);
  equal((await as(reporter,tx=>tx`SELECT leave_community_ride(${rpcRide.id},${rider}) result`))[0].result.success,true);
  const explicitDeparture=(await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${rpcRide.id} AND rider_id=${rider}`)[0];
  equal(explicitDeparture.status,'left');
  await as(reporter,tx=>tx`SELECT set_community_block(${organiser},false)`);
  equal((await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${rpcRide.id} AND rider_id=${rider}`)[0],explicitDeparture);
  // PostgREST retains timestamp microseconds; a JavaScript Date would truncate
  // them and manufacture an optimistic-concurrency conflict in this fixture.
  await as(owner,tx=>tx`SELECT cancel_my_community_ride(id,updated_at) FROM community_ride WHERE id=${rpcRide.id}`);
  equal((await db`SELECT status FROM community_ride WHERE id=${rpcRide.id}`)[0].status,'cancelled');
  equal((await db`SELECT * FROM community_ride_participant WHERE community_ride_id=${rpcRide.id} AND rider_id=${rider}`)[0],explicitDeparture);
  // Force audit failure: content/report mutation must roll back with it.
  await db.unsafe(`CREATE FUNCTION fail_safety_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
    CREATE TRIGGER fail_safety_audit BEFORE INSERT ON community_moderation_audit FOR EACH ROW EXECUTE FUNCTION fail_safety_audit()`);
  const atomic = await create();
  await assert.rejects(()=>review(atomic)); assertions++;
  equal((await db`SELECT moderation_state FROM community_ride WHERE id=${atomic.id}`)[0].moderation_state,'pending');
  await db.unsafe('DROP TRIGGER fail_safety_audit ON community_moderation_audit');
  // Evidence survives removal of original content, including the original immutable image.
  await db`DELETE FROM community_ride_participant WHERE community_ride_id=${imageRide.id}`;
  await db`DELETE FROM community_ride WHERE id=${imageRide.id}`;
  equal((await db`SELECT evidence->>'cover_image_path' path FROM community_report WHERE id=${imgReport}`)[0].path,cover);
  await deny(()=>as(null,tx=>tx`DELETE FROM storage.objects WHERE name=${cover}`,'service_role'));
  const retained = (await db`SELECT * FROM community_report WHERE id=${imgReport}`)[0];
  await review({id:imageRide.id,moderation_version:null},'dismiss',retained);
  // Rate limit is serialized; different targets cannot evade daily cap.
  for(let i=0;i<8;i++){ const x=await create(); await review(x); await report(x); }
  const excess = await create(); await review(excess); await deny(()=>report(excess),'54000');
  await db`UPDATE rider SET status='suspended' WHERE id=${rider}`;
  await deny(()=>as(reporter,tx=>tx`SELECT set_community_block(${organiser},true)`));
  await deny(()=>report(c,'text'));
  equal((await db`SELECT count(*)::int n FROM reward_transactions`)[0].n,0);
  equal((await db`SELECT count(*)::int n FROM ride_session`)[0].n,0);
  const httpAssertions=process.argv.includes('--http')?await require('./test-community-safety-http.cjs')({db,owner,organiser,outsider,third,create,review}):0;
  if(storage)await storage.run({owner,organiser,outsider,create,review,report,as});
  console.log(JSON.stringify({assertions,httpAssertions,database:'isolated PostgreSQL 17',classifier:'human pre-publication review; no simulated provider',productionMutations:false}));
}
main().catch(e=>{ console.error(e.stack,e.where??'');process.exitCode=1; }).finally(async()=>{if(storage)storage.stop();await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end();});
