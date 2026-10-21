// Isolated PostgreSQL/PostGIS only. Never loads .env or production credentials.
const postgres = require('postgres'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), {randomUUID} = require('node:crypto');
const opts={host:'127.0.0.1',port:55443,username:'postgres',password:'isolated-local-test-only',max:16,onnotice:()=>{}};
const root=postgres({...opts,database:'postgres'}), database='admin_creation_'+process.pid, db=postgres({...opts,database});
const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/creation-workflows/schema.json')));
const q=s=>'"'+s.replaceAll('"','""')+'"'; let assertions=0; const equal=(a,b)=>{assert.deepEqual(a,b);assertions++},deny=async(fn,re)=>{await assert.rejects(fn,re);assertions++};
const actor=randomUUID(), outsider=randomUUID();
async function fixture(){
 await db.unsafe(`CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;CREATE SEQUENCE workboard_card_seq;
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role;END IF;END $$;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz,banned_until timestamptz);
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE TABLE public."user"(id uuid PRIMARY KEY,status text);CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,role text);
 CREATE TABLE public.rider(id uuid PRIMARY KEY,user_id uuid);
 CREATE TABLE public.fulfilment_resource(id uuid PRIMARY KEY,partner_org_id uuid,status text,resource_kind text);
 CREATE TABLE public.shop_catalog_editor(catalog_id uuid PRIMARY KEY,actor_id uuid);`);
 for(const e of schema.enums) await db.unsafe(`CREATE TYPE ${q(e.typname)} AS ENUM (${e.labels.map(v=>"'"+v.replaceAll("'","''")+"'").join(',')})`);
 for(const table of new Set(schema.columns.map(c=>c.table_name))){
  const definitions=schema.columns.filter(c=>c.table_name===table).map(c=>{
   const exact=schema.formattedTypes.find(t=>t.table_name===table&&t.column_name===c.column_name)?.formatted_type;
   const type=exact??(c.data_type==='USER-DEFINED'?q(c.udt_name):c.data_type==='ARRAY'?q(c.udt_name.slice(1))+'[]':c.data_type);
   return q(c.column_name)+' '+type+(c.column_default?' DEFAULT '+c.column_default:'')+(c.is_nullable==='NO'?' NOT NULL':'');
  });await db.unsafe(`CREATE TABLE ${q(table)}(${definitions.join(',')})`);
 }
 await db.unsafe(fs.readFileSync(path.join(__dirname,'fixtures/creation-workflows/functions.sql'),'utf8'));
 await db.unsafe(fs.readFileSync(path.join(__dirname,'fixtures/creation-workflows/location-function.sql'),'utf8'));
 for(const c of schema.constraints) await db.unsafe(`ALTER TABLE ${c.relation} ADD CONSTRAINT ${q(c.conname)} ${c.definition}`);
 // Production PKs for supplemental tables and the relevant referential boundaries.
 for(const table of ['organisation','organisation_membership','reward_partner','reward_partner_location','reward_catalog','platform_audit_record','rider_route','partner_location_audit']) await db.unsafe(`ALTER TABLE ${q(table)} ADD PRIMARY KEY(id)`);
 await db.unsafe(`ALTER TABLE route_stop ADD FOREIGN KEY(route_id) REFERENCES route(id);ALTER TABLE route ADD FOREIGN KEY(campaign_id) REFERENCES campaign(id);
 ALTER TABLE campaign_zone ADD FOREIGN KEY(campaign_id) REFERENCES campaign(id);ALTER TABLE campaign_hot_zone ADD FOREIGN KEY(campaign_id) REFERENCES campaign(id);
 ALTER TABLE workboard_team_members ADD FOREIGN KEY(team_id) REFERENCES workboard_teams(id);ALTER TABLE workboard_boards ADD FOREIGN KEY(team_id) REFERENCES workboard_teams(id);
 ALTER TABLE workboard_cards ADD FOREIGN KEY(board_id) REFERENCES workboard_boards(id);ALTER TABLE campaign ADD FOREIGN KEY(advertiser_id) REFERENCES advertiser(id);`);
 await db.unsafe(`ALTER TABLE rider_route ADD FOREIGN KEY(rider_id) REFERENCES rider(id);ALTER TABLE rider_route ADD FOREIGN KEY(route_id) REFERENCES route(id);
 ALTER TABLE reward_catalog_location ADD PRIMARY KEY(location_id,catalog_item_id);`);
 await db.unsafe(fs.readFileSync(path.join(__dirname,'fixtures/creation-workflows/catalog-functions.sql'),'utf8'));
 await db.unsafe(fs.readFileSync(path.join(__dirname,'056_alignment_capabilities.sql'),'utf8'));
 await db.unsafe(fs.readFileSync(path.join(__dirname,'050_platform_invitations.sql'),'utf8'));
 const baselineInvite=fs.readFileSync(path.join(__dirname,'fixtures/creation-workflows/invitation-function.sql'),'utf8')
  .replace('public.accept_workboard_platform_invitation(', 'public.accept_workboard_platform_invitation_baseline(')
  .replace(/RETURN QUERY SELECT false, 'transaction_failed', 'Invitation acceptance failed',[\s\S]*?NULL::text;/, 'RAISE;');
 await db.unsafe(baselineInvite);

 const tx=await db.reserve();try{await tx.unsafe(fs.readFileSync(path.join(__dirname,'069_admin_creation_transactions.sql'),'utf8'));}finally{await tx.release();}
 const canonical=fs.readFileSync(path.join(__dirname,'070_employee_rbac_authority.sql'),'utf8');
 await db.unsafe(canonical.slice(canonical.indexOf('CREATE OR REPLACE FUNCTION public.accept_workboard_platform_invitation'),canonical.indexOf('CREATE OR REPLACE FUNCTION public.join_community_ride')));
 for(const id of [actor,outsider]){await db`insert into auth.users(id) values(${id})`;await db`insert into public."user" values(${id},'active')`;await db`insert into admin_users values(${id},'super_admin')`;}
 const identitySql=fs.readFileSync(path.join(__dirname,'071_external_account_domains.sql'),'utf8');
 await db.unsafe(identitySql.slice(identitySql.indexOf('-- BEGIN ADVERTISER ORGANISATION DEPENDENCY'),identitySql.indexOf('-- END ADVERTISER ORGANISATION DEPENDENCY')));
 await db.unsafe(identitySql.slice(identitySql.indexOf('CREATE OR REPLACE FUNCTION public.ops_organisation_capabilities('),identitySql.indexOf('-- END GENERATED ORGANISATION CAPABILITIES')));
 const identityMigration=await db.reserve();try{await identityMigration.unsafe(fs.readFileSync(path.join(__dirname,'074_identity_consumer_authorization.sql'),'utf8'));}finally{identityMigration.release();}
}
async function command(kind,input,operation=randomUUID(),who=actor){return db.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','service_role',true)`;return(await tx`select admin_create(${who},${operation},${kind},${tx.json(input)}) result`)[0].result;});}
const count=async(table)=>(await db.unsafe(`select count(*)::int n from ${q(table)}`))[0].n;
const route={name:'Atomic route',start_lat:52.3,start_lng:4.8,end_lat:52.4,end_lng:4.9,city:'Amsterdam',country:'NL',status:'pending',difficulty:'easy'};
const polygon={type:'Polygon',coordinates:[[[4.8,52.3],[4.9,52.3],[4.9,52.4],[4.8,52.3]]]};
async function main(){
 await root.unsafe(`CREATE DATABASE ${q(database)}`);await fixture();
 // Bootstrap is one transaction even when the owner membership insert fails.
 await db.unsafe(`CREATE FUNCTION fail_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected bootstrap member failure';END $$;
 CREATE TRIGGER fail_bootstrap BEFORE INSERT ON workboard_team_members FOR EACH ROW EXECUTE FUNCTION fail_bootstrap();`);
 await deny(command('workboard_bootstrap',{}),/Injected bootstrap/);equal(await count('workboard_teams'),0);equal(await count('workboard_team_members'),0);
 await db.unsafe('DROP TRIGGER fail_bootstrap ON workboard_team_members');
 const boot=await Promise.all(Array.from({length:6},()=>command('workboard_bootstrap',{})));
 equal(new Set(boot.map(x=>x.teamId)).size,1);equal(await count('workboard_teams'),1);equal(await count('workboard_team_members'),1);
 const team=boot[0].teamId, boardOp=randomUUID(), boardInput={record:{team_id:team,title:'Operations',status_key:'ops',tone:'slate',position:0}};
 const boards=await Promise.all(Array.from({length:5},()=>command('workboard_board',boardInput,boardOp)));equal(new Set(boards.map(x=>x.id)).size,1);equal(await count('workboard_boards'),1);
 await deny(command('workboard_board',boardInput,randomUUID(),outsider),/membership required/);
 const card={record:{team_id:team,board_id:boards[0].id,title:'Card',type:'Operations',priority:'Medium',position:0}};
 const cardOp=randomUUID();await command('workboard_card',card,cardOp);await command('workboard_card',card,cardOp);equal(await count('workboard_cards'),1);
 await deny(command('workboard_card',{record:{...card.record,board_id:randomUUID()}}),/Board does not belong/);equal(await count('workboard_cards'),1);
 // Route and all children roll back together, with real PostGIS types/validation.
 const advertiser=randomUUID();await db`insert into advertiser(id,company_name) values(${advertiser},'Test brand')`;
 const campaign=await command('campaign',{record:{advertiser_id:advertiser,name:'Campaign',budget:100,start_date:'2026-10-01',end_date:'2026-12-01'}});
 const routeOp=randomUUID(), bundle={record:{...route,campaign_id:campaign.id},stops:[{name:'Stop',lat:52.3,lng:4.8,stop_order:0}],zones:[{name:'Zone',geom:polygon}],hotZones:[{name:'Bonus',geom:polygon,bonus_percent:10}]};
 const original=await count('route');
 await deny(command('route',{...bundle,stops:[{name:'Invalid stop',lat:52.3,stop_order:0}]},routeOp),/null value/);equal(await count('route'),original);equal(await count('route_stop'),0);equal(await count('campaign_zone'),0);
 const created=await command('route',bundle,routeOp);equal(created.id,routeOp);equal(await count('route_stop'),1);equal(await count('campaign_zone'),1);equal(await count('campaign_hot_zone'),1);
 equal((await db`select ST_GeometryType(geom) kind,ST_SRID(geom) srid from campaign_zone`)[0],{kind:'ST_MultiPolygon',srid:4326});
 await command('route',bundle,routeOp);equal(await count('route'),original+1);equal(await count('route_stop'),1);
 await deny(command('route',{...bundle,record:{...bundle.record,name:'Changed retry'}},routeOp),/Conflicting creation retry/);
 const baseline=await count('route');await deny(command('route',{...bundle,hotZones:[{name:'Invalid',geom:polygon,bonus_percent:-1}]}),/check constraint/);equal(await count('route'),baseline);equal(await count('campaign_zone'),1);
 const stopId=(await db`select id from route_stop limit 1`)[0].id;
 const stopChanges={routeId:routeOp,stops:[{id:stopId,name:'Updated stop',lat:52.31,lng:4.81,stop_order:0},{name:'Added stop',lat:52.32,lng:4.82,stop_order:1}]};
 const stopChangeOp=randomUUID(),changedStops=await command('route_stops',stopChanges,stopChangeOp);equal(changedStops.ids.length,2);
 await command('route_stops',stopChanges,stopChangeOp);equal(await count('route_stop'),2);
 await deny(command('route_stops',{routeId:routeOp,stops:[{id:stopId,name:'Must rollback',lat:52.3,lng:4.8,stop_order:0},{name:'Invalid',lat:null,lng:4.8,stop_order:1}]}),/null value/);
 equal((await db`select name from route_stop where id=${stopId}`)[0].name,'Updated stop');equal(await count('route_stop'),2);
 const zoneId=(await db`select id from campaign_zone limit 1`)[0].id;
 const geoChanges={campaignId:campaign.id,zones:[{id:zoneId,name:'Updated zone',geom:polygon}],hotZones:[{name:'New bonus',geom:polygon,bonus_percent:5}]};
 const geoOp=randomUUID();await command('campaign_geography',geoChanges,geoOp);await command('campaign_geography',geoChanges,geoOp);equal(await count('campaign_hot_zone'),2);
 await deny(command('campaign_geography',{...geoChanges,zones:[{id:zoneId,name:'Must rollback',geom:polygon}],hotZones:[{name:'Invalid',geom:polygon,bonus_percent:-5}]}),/check constraint/);
 equal((await db`select name from campaign_zone where id=${zoneId}`)[0].name,'Updated zone');
 const otherCampaign=await command('campaign',{record:{advertiser_id:advertiser,name:'Other campaign',budget:10,start_date:'2026-10-01',end_date:'2026-12-01'}});
 await deny(command('campaign_geography',{...geoChanges,campaignId:otherCampaign.id}),/Child not found/);
 // A failed route attachment must not leave a campaign or its creation audit.
 const routeToAssign=await command('route',{record:route}), campaignOp=randomUUID();
 const campaignInput={record:{advertiser_id:advertiser,name:'With routes',budget:100,start_date:'2026-10-01',end_date:'2026-12-01'},routeIds:[routeToAssign.id,randomUUID()]};
 const beforeCampaign=await count('campaign');await deny(command('campaign',campaignInput,campaignOp),/Every route/);equal(await count('campaign'),beforeCampaign);
 equal((await db`select campaign_id from route where id=${routeToAssign.id}`)[0].campaign_id,null);
 const valid={...campaignInput,routeIds:[routeToAssign.id]};await command('campaign',valid,campaignOp);await command('campaign',valid,campaignOp);
 equal((await db`select campaign_id from route where id=${routeToAssign.id}`)[0].campaign_id,campaignOp);equal(await count('campaign'),beforeCampaign+1);
 equal((await db`select count(*)::int n from platform_audit_record where target_entity_id=${campaignOp} and reason='entity_initiator'`)[0].n,1);
 // Organisation + partner share the production transaction and replay result.
 const orgOp=randomUUID(),org=await command('organisation',{name:'New partner',type:'reward_partner'},orgOp);
 equal(org.organisation.type,'reward_partner');equal(org.partner.organisation_id,org.organisation.id);
 await command('organisation',{name:'New partner',type:'reward_partner'},orgOp);equal(await count('organisation'),1);equal(await count('reward_partner'),1);
 await deny(command('organisation',{name:'New partner',type:'reward_partner'}),/already belongs/);equal(await count('organisation'),1);
 equal((await db`select organisation_id from reward_partner where id=${org.partner.id}`)[0].organisation_id,org.organisation.id);
 // Catalog wrapper exercises the captured production Shop functions unchanged.
 const catalogOp=randomUUID(),catalogInput={record:{sku:'ATOMIC-001',title:'Draft reward',description:'A test',category:'voucher',status:'draft',points_price:50,inventory_type:'unlimited',gallery_urls:[],tags:[],visibility_rules:{},is_featured:false},partnerName:'Catalog partner'};
 const orgCount=await count('organisation');await deny(command('catalog',{...catalogInput,record:{...catalogInput.record,points_price:-1}},catalogOp),/Invalid catalog pricing/);equal(await count('organisation'),orgCount);
 const catalog=await command('catalog',catalogInput,catalogOp);await command('catalog',catalogInput,catalogOp);equal(catalog.status,'draft');equal(await count('reward_catalog'),1);equal(await count('organisation'),orgCount+1);
 await deny(command('catalog',{...catalogInput,record:{...catalogInput.record,sku:'ACTIVE-001',status:'active'}}),/Create a draft/);
 equal(await count('reward_catalog'),1);
 // Partner locations are transactional and replayable; a wrong reward owner
 // rolls back both the location and its association/audit writes.
 const locationOp=randomUUID(),locationInput={organisationId:org.organisation.id,location:{name:'Location',address:'Amsterdam',latitude:52.3,longitude:4.8,status:'draft',coordinatesVerified:false,rewardIds:[]}};
 const location=await command('partner_location',locationInput,locationOp);await command('partner_location',locationInput,locationOp);equal(await count('reward_partner_location'),1);
 equal(location.organisation_id,org.organisation.id);
 await deny(command('partner_location',{...locationInput,location:{...locationInput.location,rewardIds:[catalog.id]}}),/another partner/);equal(await count('reward_partner_location'),1);
 // Concurrent/retried route assignment uses the route row lock, not a racy
 // pre-insert lookup; invalid riders roll back the entire batch and its audit.
 const riderA=randomUUID(),riderB=randomUUID();await db`insert into rider(id) values(${riderA}),(${riderB})`;
 const assign=ids=>db.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','service_role',true)`;return(await tx`select assign_admin_route(${actor},${routeToAssign.id},${ids}::uuid[]) result`)[0].result;});
 await deny(assign([riderA,randomUUID()]),/Rider not found/);equal(await count('rider_route'),0);
 const batches=await Promise.all(Array.from({length:5},()=>assign([riderA,riderB,riderA])));equal(batches.reduce((n,x)=>n+x.assignedCount,0),2);equal(await count('rider_route'),2);
 // Existing-employee invitation acceptance never creates Auth/public/Rider rows.
 const invitee=randomUUID(),inviteId=randomUUID(),hash=randomUUID().replaceAll('-','');
 await db`insert into auth.users(id,email) values(${invitee},'employee-invite@example.test')`;await db`insert into public."user" values(${invitee},'active')`;await db`insert into admin_users values(${invitee},'partner_operations_manager')`;
 await db`insert into platform_invitations(id,scope,target_entity_id,email,role,token_hash,invited_by,expires_at) values(${inviteId},'workboard_team',${team},'employee-invite@example.test','editor',${hash},${actor},now()+interval '1 day')`;
 const authBefore=await db`select count(*)::int n from auth.users`;
 await deny(db`select * from accept_workboard_platform_invitation_baseline(${hash},${invitee},'employee-invite@example.test')`,/column reference "team_id" is ambiguous/);
 equal((await db`select status from platform_invitations where id=${inviteId}`)[0].status,'pending');

 const accept=()=>db`select * from accept_workboard_platform_invitation(${hash},${invitee},'employee-invite@example.test')`;
 await db`update admin_users set role=null where user_id=${invitee}`;
 equal((await accept())[0].error_code,'ineligible_role');
 await db`update admin_users set role='partner_operations_manager' where user_id=${invitee}`;
 await db`update auth.users set banned_until=now()+interval '1 day' where id=${invitee}`;
 equal((await accept())[0].error_code,'ineligible_role');
 await db`update auth.users set banned_until=null where id=${invitee}`;
 equal((await db`select status from platform_invitations where id=${inviteId}`)[0].status,'pending');
 await db.unsafe(`CREATE FUNCTION fail_invitation_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected invitation member failure';END $$;CREATE TRIGGER fail_invitation_member BEFORE INSERT ON workboard_team_members FOR EACH ROW EXECUTE FUNCTION fail_invitation_member();`);
 equal((await accept())[0].success,false);equal((await db`select status from platform_invitations where id=${inviteId}`)[0].status,'pending');equal((await db`select count(*)::int n from workboard_team_members where user_id=${invitee}`)[0].n,0);
 await db.unsafe('DROP TRIGGER fail_invitation_member ON workboard_team_members');
 const accepted=await Promise.all(Array.from({length:5},()=>accept()));equal(accepted.every(rows=>rows[0].success),true);equal(new Set(accepted.map(rows=>rows[0].membership_id)).size,1);
 equal((await db`select count(*)::int n from auth.users`)[0].n,authBefore[0].n);equal((await db`select role from admin_users where user_id=${invitee}`)[0].role,'partner_operations_manager');
 // Other single-record create surfaces retain their schemas and replay safely.
 const tipOp=randomUUID(),tip={record:{icon:'🚲',text:'A useful cycling tip',priority:1,is_active:true}};await command('pro_tip',tip,tipOp);await command('pro_tip',tip,tipOp);equal(await count('pro_tips'),1);
 const rideOp=randomUUID(),ride={record:{title:'Community test ride',scheduled_at:'2026-12-01T10:00:00Z',max_participants:10,category:'social',status:'upcoming',is_public:true,organizer_type:'movrr',organizer_name:'MOVRR'}};
 await command('community_ride',ride,rideOp);await command('community_ride',ride,rideOp);equal(await count('community_ride'),1);
 const suggestionOp=randomUUID(),suggestion={record:{name:'Suggested test route',geometry:[{lat:52.3,lng:4.8},{lat:52.4,lng:4.9}],estimated_duration_minutes:30,estimated_distance_meters:5000,difficulty:'moderate',reward_type:'bonus',reward_value:50}};
 await command('suggested_route',suggestion,suggestionOp);await command('suggested_route',suggestion,suggestionOp);equal(await count('suggested_routes'),1);
 // Privilege denial precedes every entity write and RPC/helper ACLs fail closed.
 const noGrant=randomUUID();await db`insert into auth.users(id) values(${noGrant})`;await db`insert into public."user" values(${noGrant},'active')`;
 await deny(command('route',{record:route},randomUUID(),noGrant),/Unauthorized/);
 equal((await db`select has_function_privilege('authenticated','public.admin_create(uuid,uuid,text,jsonb)','execute') allowed`)[0].allowed,false);
 equal((await db`select has_function_privilege('service_role','public.admin_insert_creation_record(text,jsonb)','execute') allowed`)[0].allowed,false);
 console.log(JSON.stringify({status:'passed',assertions,database:'isolated PostgreSQL 17 + PostGIS',productionMutations:false,contracts:'captured production column types, enums, checks, unique constraints, route validator, organisation save and Shop catalog/authorization functions'}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{await db.end({timeout:5});await root.unsafe(`DROP DATABASE IF EXISTS ${q(database)} WITH (FORCE)`).catch(()=>{});await root.end({timeout:5});});
