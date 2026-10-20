// Explicitly read-only production inspection. No DDL, mutations, impersonation,
// Auth Admin calls, email or account repair. Never prints connection credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),postgres=require('postgres');
const email=process.argv[2];assert(email&&/^[^\s@]+@[^\s@]+$/.test(email),'Supply the incident email as the only argument');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'),'Unexpected production project');
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{application_name:'movrr-creation-readonly',default_transaction_read_only:'on',statement_timeout:'15000'}});
const hash=s=>crypto.createHash('sha256').update(s.replace(/\r\n/g,'\n').trim()).digest('hex');
(async()=>{try{const result=await db.begin('read only',async tx=>({
  inspectedAt:new Date().toISOString(),readOnly:(await tx`show transaction_read_only`)[0].transaction_read_only,
  account:await tx`select a.id auth_id,a.created_at,a.last_sign_in_at,coalesce(a.banned_until>now(),false) auth_banned,a.deleted_at,
    a.raw_user_meta_data->>'server_assigned_role' requested_role,u.role public_role,u.status public_status,r.id rider_id,r.status rider_status,ad.role employee_role,
    (select coalesce(jsonb_agg(jsonb_build_object('organisationId',m.organisation_id,'organisationType',o.type,'role',m.role,'bundle',m.bundle_key,'status',m.status)),'[]') from public.organisation_membership m join public.organisation o on o.id=m.organisation_id where m.user_id=a.id) memberships
    from auth.users a left join public."user" u on u.id=a.id left join public.rider r on r.user_id=a.id left join public.admin_users ad on ad.user_id=a.id where lower(a.email)=${email.toLowerCase()}`,
  enumLabels:await tx`select enumlabel from pg_enum where enumtypid='public.user_role'::regtype order by enumsortorder`,
  shop:await tx`select state,redemption_enabled from public.shop_release_control where singleton`,
  deletion:await tx`select requests_enabled from public.account_deletion_contract_gate where singleton`,
  schemaDrift:await Promise.all([
    ['public.handle_new_user()','fixtures/employee-provisioning/handle_new_user.sql'],
    ['public.accept_workboard_platform_invitation(text,uuid,text)','fixtures/creation-workflows/invitation-function.sql'],
  ].map(async([signature,file])=>{const definition=(await tx`select pg_get_functiondef(${signature}::regprocedure) definition`)[0].definition;return{signature,sha256:hash(definition),matchesCapturedBaseline:hash(definition)===hash(fs.readFileSync(path.join(__dirname,file),'utf8'))}})),
}));console.log(JSON.stringify(result,null,2));}finally{await db.end({timeout:5})}})().catch(error=>{console.error(error.message);process.exitCode=1});
