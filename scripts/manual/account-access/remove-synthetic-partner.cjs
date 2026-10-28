// Exact, owner-authorized removal of the now-empty activation fixture tenant.
// Defaults to rollback rehearsal. No FK cascades/SET NULL or guard bypass allowed.
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, 'kzdvunpuxaxlphqvmzxw.supabase.co');
const sql = require('postgres')(process.env.DATABASE_URL, { ssl: 'require', max: 1, onnotice() {}, connection: {
  application_name: 'movrr-authorized-synthetic-partner-removal', statement_timeout: '30000', lock_timeout: '5000',
} });
const directory = 'docs/verification/account-access-activation-20261028';
const fixture = JSON.parse(fs.readFileSync(`${directory}/synthetic-fixture.json`, 'utf8'));
const org = '1f6de656-c4f0-4c66-9837-760b6095f763';
assert.equal(fixture.organisationId, org);
assert.equal(fixture.runId, '2c206ddf-6411-40e6-bd4c-89e176ac6192');
const apply = process.argv.includes('--apply'), verifyOnly = process.argv.includes('--verify-only');
assert(!(apply && verifyOnly));
const evidence = { project: 'kzdvunpuxaxlphqvmzxw', organisationId: org, startedAt: new Date().toISOString(),
  mode: verifyOnly ? 'verify-only' : apply ? 'apply' : 'rollback-rehearsal', affectedUserContacted: false };
const rollback = new Error('intentional_rehearsal_rollback');
async function accountInventory(db) {
  const counts = (await db`select
    (select count(*)::int from auth.users where id=any(${Object.values(fixture.accounts)}::uuid[])
      or email ilike '%movrr-access-%' or email ilike '%2c206ddf%' or raw_user_meta_data->>'full_name' ilike '%synthetic%') auth_accounts,
    (select count(*)::int from public."user" where id=any(${Object.values(fixture.accounts)}::uuid[])
      or name ilike '%synthetic%' or email ilike '%movrr-access-%' or email ilike '%2c206ddf%') public_accounts,
    (select count(*)::int from public.reward_partner where organisation_id=${org}::uuid or name ilike '%synthetic%') partner_accounts`)[0];
  assert(Object.values(counts).every(n=>n===0),'remaining_synthetic_account_requires_review');
  return counts;
}
async function verify(db) {
  const result = await accountInventory(db);
  result.organisations = (await db`select count(*)::int n from public.organisation where id=${org}::uuid or name ilike '%synthetic%'`)[0].n;
  assert.equal(result.organisations, 0);
  return result;
}
async function main() {
  try {
    if (verifyOnly) evidence.remaining = await sql.begin('read only',verify);
    else {
      try { await sql.begin('isolation level serializable', async db => {
        const dependencies = await db`select n.nspname||'.'||c.relname relation,a.attname column,cardinality(k.conkey) width
          from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
          join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
          where k.contype='f' and k.confrelid='public.organisation'::regclass`;
        const scope = [...new Set(['public.organisation','public.platform_audit_record','public.audit_log',
          'public.account_deletion_audit','public.account_deletion_managed_write','public.employee_provisioning',
          'public.external_account_provisioning',...dependencies.map(d=>d.relation)])].sort();
        for(const table of scope) await db`lock table ${db(table)} in share row exclusive mode`;
        const rows=await db`select * from public.organisation where id=${org}::uuid`;
        assert.equal(rows.length,1);
        assert.equal(rows[0].name,'MOVRR synthetic recovery verification');
        assert.equal(rows[0].type,'reward_partner');
        evidence.removedOrganisation=rows[0];
        evidence.accountInventory=await accountInventory(db);
        for(const d of dependencies) {
          assert.equal(d.width,1,'composite_organisation_fk_requires_review');
          assert.equal((await db`select count(*)::int n from ${db(d.relation)} where ${db(d.column)}=${org}::uuid`)[0].n,0,`organisation_not_empty:${d.relation}`);
        }
        // Catch UUID relationships not declared as foreign keys as well.
        const columns=await db`select n.nspname||'.'||c.relname relation,a.attname column from pg_attribute a
          join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
          where n.nspname in ('public','auth','storage') and c.relkind in ('r','p') and a.attnum>0
          and not a.attisdropped and a.atttypid='uuid'::regtype`;
        for(const c of columns.filter(c=>!(c.relation==='public.organisation'&&c.column==='id'))) {
          assert.equal((await db`select count(*)::int n from ${db(c.relation)} where ${db(c.column)}=${org}::uuid`)[0].n,0,`unexpected_organisation_reference:${c.relation}.${c.column}`);
        }
        async function fingerprints() {
          const result=[];
          for(const table of scope) result.push({relation:table,...(await db`select count(*)::int rows,
            md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) digest
            from ${db(table)} x where not (${table}='public.organisation' and to_jsonb(x)->>'id'=${org})`)[0]});
          return result;
        }
        const before=await fingerprints();
        assert.equal((await db`delete from public.organisation where id=${org}::uuid returning id`).length,1);
        assert.deepEqual(await fingerprints(),before,'unrelated_or_audit_record_changed');
        evidence.protectedFingerprints=before;
        evidence.remaining=await verify(db);
        if(!apply)throw rollback;
      }); } catch(e) { if(e!==rollback)throw e; evidence.rolledBack=true; }
      if(apply)evidence.independentVerification=await sql.begin('read only',verify);
    }
    evidence.completedAt=new Date().toISOString();
    const name=verifyOnly?'verification':apply?'applied':'rehearsal';
    fs.writeFileSync(`${directory}/synthetic-partner-removal-${name}.json`,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({mode:evidence.mode,remaining:evidence.remaining,rolledBack:evidence.rolledBack,completedAt:evidence.completedAt}));
  } finally { await sql.end(); }
}
main().catch(e=>{console.error('Synthetic partner cleanup failed:',e.code||'',e.message);process.exitCode=1;});
