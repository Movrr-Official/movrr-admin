// Owner-authorized cleanup of the exact six production activation fixtures.
// Defaults to a full rollback rehearsal. Never disables triggers or clears holds.
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kzdvunpuxaxlphqvmzxw.supabase.co');
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, onnotice() {}, connection: {
  application_name: 'movrr-authorized-synthetic-removal', statement_timeout: '30000', lock_timeout: '5000',
} });
const directory = 'docs/verification/account-access-activation-20261028';
const fixture = JSON.parse(fs.readFileSync(`${directory}/synthetic-fixture.json`, 'utf8'));
const pinned = ['236feec3-e543-4e65-ae8a-455ad6f2548d','f82e03fc-0e6d-4e6d-8c8b-a54aa1db9972',
  'f17cccef-f39b-44f7-b241-fe1c35715149','69e50d84-b406-43ef-a4cd-143fc520266b',
  'c1643cdf-9446-45ca-87ca-e5c07f97c9c9','1703a5ee-f2e3-4e5f-95f6-88109200257b'].sort();
assert.deepEqual(Object.values(fixture.accounts).sort(), pinned);
assert.equal(fixture.runId, '2c206ddf-6411-40e6-bd4c-89e176ac6192');
assert.equal(fixture.organisationId, '1f6de656-c4f0-4c66-9837-760b6095f763');
const apply = process.argv.includes('--apply');
const verifyOnly = process.argv.includes('--verify-only');
assert(!(apply && verifyOnly));
const evidence = { project: 'kzdvunpuxaxlphqvmzxw', startedAt: new Date().toISOString(),
  accountIds: pinned, mode: verifyOnly ? 'verify-only' : apply ? 'apply' : 'rollback-rehearsal', affectedUserContacted: false };
const rollback = new Error('intentional_rehearsal_rollback');
// Only these disposable records may be deleted. Audits, reservations and guards stay.
const order = ['auth.mfa_challenges','auth.mfa_amr_claims','auth.refresh_tokens','auth.sessions',
  'auth.one_time_tokens','auth.identities','auth.mfa_factors','auth.oauth_consents','auth.oauth_authorizations',
  'auth.webauthn_credentials','auth.webauthn_challenges','auth.mfa_recovery_code_sets',
  'public.admin_dashboard_sessions','public.user_activity','public.organisation_membership',
  'public.platform_invitations','public.admin_users','public.user','auth.users'];
const preserved = ['public.platform_audit_record','public.audit_log','public.account_deletion_audit',
  'auth.audit_log_entries','public.account_deletion_managed_write','public.account_deletion_write_guard',
  'public.employee_provisioning','public.external_account_provisioning','public.organisation'];
const historical = new Set([...preserved, 'public.account_deletion_alias']);
async function verify(db) {
  const counts = {};
  for (const [table, column] of [['auth.users','id'],['public.user','id'],['public.admin_users','user_id'],
    ['public.organisation_membership','user_id'],['auth.sessions','user_id'],['auth.refresh_tokens','user_id'],
    ['auth.identities','user_id'],['auth.mfa_factors','user_id'],['auth.one_time_tokens','user_id'],
    ['public.admin_dashboard_sessions','auth_user_id'],['public.user_activity','user_id']]) {
    counts[table] = (await db`select count(*)::int n from ${db(table)} where ${db(column)}::text=any(${pinned}::text[])`)[0].n;
  }
  assert(Object.values(counts).every(n => n === 0), 'synthetic_login_or_membership_records_remain');
  return counts;
}
async function main() {
  try {
    if (verifyOnly) {
      evidence.remaining = await sql.begin('read only', verify);
      const { createClient } = require('@supabase/supabase-js');
      const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } });
      evidence.authApi = [];
      for (const id of pinned) {
        const result = await auth.auth.admin.getUserById(id);
        assert.equal(result.data.user, null);
        assert.equal(result.error?.status, 404, 'auth_api_identity_still_present');
        evidence.authApi.push({ id, status: 404 });
      }
    } else {
      try { await sql.begin('isolation level serializable', async db => {
        const relations = await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','auth','storage')`;
        const exists = new Set(relations.map(r => r.name));
        const targets = order.filter(t => exists.has(t));
        const fks = await db`select nc.nspname||'.'||c.relname child,np.nspname||'.'||p.relname parent,
          a.attname child_column,b.attname parent_column,cardinality(k.conkey) width
          from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace nc on nc.oid=c.relnamespace
          join pg_class p on p.oid=k.confrelid join pg_namespace np on np.oid=p.relnamespace
          join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
          join pg_attribute b on b.attrelid=k.confrelid and b.attnum=k.confkey[1] where k.contype='f'`;
        const scope = [...new Set([...targets, ...preserved, ...fks.filter(f=>targets.includes(f.parent)).map(f=>f.child)])].sort();
        for (const table of scope) await db`lock table ${db(table)} in share row exclusive mode`;
        const identities = await db`select id,email,raw_app_meta_data from auth.users where id=any(${pinned}::uuid[])`;
        assert.equal(identities.length, 6);
        for (const [name,id] of Object.entries(fixture.accounts)) {
          const row=identities.find(r=>r.id===id);
          assert.equal(row.email, fixture.emails?.[name] ?? `delivered+movrr-access-${fixture.runId}-${name}@resend.dev`);
          assert.equal(row.raw_app_meta_data[name.startsWith('operator')?'employee_provisioning_id':'external_account_provisioning_id'], id);
        }
        const profiles=await db`select id,name,role from public."user" where id=any(${pinned}::uuid[])`;
        assert.equal(profiles.length,6);
        for(const [name,id] of Object.entries(fixture.accounts)) {
          assert.equal(profiles.find(r=>r.id===id).name,`MOVRR synthetic recovery ${name} ${fixture.runId.slice(0,8)}`);
          assert.equal(profiles.find(r=>r.id===id).role,null);
        }
        assert.equal((await db`select count(*)::int n from public.admin_users where user_id=any(${pinned}::uuid[]) and role is not null`)[0].n,0);
        assert.equal((await db`select count(*)::int n from public.account_deletion_jobs where user_id=any(${pinned}::uuid[])`)[0].n,0);
        assert.equal((await db`select count(*)::int n from public.account_deletion_write_guard where user_id=any(${pinned}::uuid[]) and (restricted or job_id is not null)`)[0].n,0);
        const memberships=await db`select id,organisation_id from public.organisation_membership where user_id=any(${pinned}::uuid[])`;
        assert.equal(memberships.length,4); assert(memberships.every(m=>m.organisation_id===fixture.organisationId));
        const activities=await db`select * from public.user_activity where user_id=any(${pinned}::uuid[]) or actor_user_id=any(${pinned}::uuid[]) order by id`;
        assert.equal(activities.length,9);
        assert(activities.every(a=>pinned.includes(a.user_id)&&pinned.includes(a.actor_user_id)&&a.action==='dashboard_session_started'));
        // Store the exact synthetic activity records before their mandatory FK deletion.
        const archive = `${directory}/synthetic-session-activity-archive.json`;
        if(apply) fs.writeFileSync(archive,JSON.stringify({reason:'Synthetic account removal requested by owner',records:activities},null,2)+'\n');
        await db`create temporary table cleanup_rows(relation text,key jsonb,primary key(relation,key)) on commit drop`;
        const primary = await db`select n.nspname||'.'||c.relname relation,array_agg(a.attname order by x.ordinality) columns
          from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
          cross join lateral unnest(i.indkey) with ordinality x(attnum,ordinality)
          join pg_attribute a on a.attrelid=i.indrelid and a.attnum=x.attnum
          where i.indisprimary group by n.nspname,c.relname`;
        function keyFor(table) {
          const columns=primary.find(p=>p.relation===table)?.columns; assert(columns?.length,`missing_primary_key:${table}`);
          return db`jsonb_build_object(${db.unsafe(columns.map(c=>`'${c.replaceAll("'","''")}',x."${c.replaceAll('"','""')}"`).join(','))})`;
        }
        async function add(table,predicate) {
          if(!targets.includes(table))return;
          await db`insert into cleanup_rows select ${table},${keyFor(table)} from ${db(table)} x where ${predicate} on conflict do nothing`;
        }
        for(const table of targets) {
          if(['auth.users','public.user'].includes(table)) await add(table,db`x.id=any(${pinned}::uuid[])`);
          else if(table==='public.platform_invitations') {
            const emails=identities.map(u=>u.email);
            await add(table,db`x.scope='organisation' and x.target_entity_id=${fixture.organisationId}::uuid and x.email=any(${emails}::text[])`);
          } else if(table==='public.admin_dashboard_sessions') await add(table,db`x.auth_user_id=any(${pinned}::uuid[])`);
          else if(!['auth.mfa_challenges','auth.mfa_amr_claims'].includes(table)) await add(table,db`x.user_id::text=any(${pinned}::text[])`);
        }
        // Only Auth child credentials may be discovered recursively; unexpected
        // public dependencies abort, including FK SET NULL/CASCADE changes.
        let changed;
        do { changed=false;
          for(const fk of fks.filter(f=>targets.includes(f.parent))) {
            assert.equal(fk.width,1,`composite_fk_requires_review:${fk.child}`);
            const condition=db`exists(select from ${db(fk.parent)} p join cleanup_rows m on m.relation=${fk.parent} and to_jsonb(p) @> m.key where x.${db(fk.child_column)}=p.${db(fk.parent_column)})`;
            const found=(await db`select count(*)::int n from ${db(fk.child)} x where ${condition} and not exists(select from cleanup_rows m where m.relation=${fk.child} and to_jsonb(x) @> m.key)`)[0].n;
            if(found) {
              assert(targets.includes(fk.child)&&fk.child.startsWith('auth.')&&fk.child!=='auth.users',`unexpected_dependency:${fk.child}`);
              await add(fk.child,condition); changed=true;
            }
          }
        } while(changed);
        // UUID ownership without an FK also fails closed unless it is preserved
        // historical evidence. Storage ownership/path matches are never removed.
        const columns=await db`select n.nspname||'.'||c.relname relation,a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped and (a.atttypid='uuid'::regtype or (a.atttypid in ('text'::regtype,'varchar'::regtype) and a.attname in ('user_id','owner','owner_id','actor_user_id','subject_id')))`;
        for(const c of columns.filter(c=>!historical.has(c.relation))) {
          const n=(await db`select count(*)::int n from ${db(c.relation)} x where x.${db(c.attname)}::text=any(${pinned}::text[]) and not exists(select from cleanup_rows m where m.relation=${c.relation} and to_jsonb(x) @> m.key)`)[0].n;
          assert.equal(n,0,`unexpected_logical_reference:${c.relation}.${c.attname}`);
        }
        assert.equal((await db`select count(*)::int n from storage.objects where owner_id=any(${pinned}::text[]) or exists(select from unnest(${pinned}::text[]) id where position(id in name)>0)`)[0].n,0);
        evidence.deleted=await db`select relation,count(*)::int rows from cleanup_rows group by relation order by relation`;
        assert.equal(evidence.deleted.find(r=>r.relation==='public.platform_invitations')?.rows,2);
        // Compare every unrelated row and every preserved table across deletion.
        async function fingerprints() {
          const result=[];
          for(const table of scope) result.push({relation:table,...(await db`select count(*)::int rows,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) digest from ${db(table)} x where not exists(select from cleanup_rows m where m.relation=${table} and to_jsonb(x) @> m.key)`)[0]});
          return result;
        }
        const before=await fingerprints();
        for(const table of targets) await db`delete from ${db(table)} x where exists(select from cleanup_rows m where m.relation=${table} and to_jsonb(x) @> m.key)`;
        assert.deepEqual(await fingerprints(),before,'unrelated_or_preserved_records_changed');
        evidence.protectedFingerprints=before;
        evidence.remaining=await verify(db);
        evidence.preservedManagedWriteHolds=true;
        evidence.archivedSyntheticSessionEvents=activities.length;
        if(!apply)throw rollback;
      }); } catch(error) { if(error!==rollback)throw error; evidence.rolledBack=true; }
      if(apply)evidence.independentVerification=await sql.begin('read only',verify);
    }
    evidence.completedAt=new Date().toISOString();
    const file=verifyOnly?'synthetic-removal-verification.json':apply?'synthetic-removal.json':'synthetic-removal-rehearsal.json';
    fs.writeFileSync(`${directory}/${file}`,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({mode:evidence.mode,remaining:evidence.remaining,rolledBack:evidence.rolledBack,completedAt:evidence.completedAt}));
  } finally { await sql.end(); }
}
main().catch(error=>{console.error('Synthetic cleanup failed:',error.code||'',error.message);process.exitCode=1;});
