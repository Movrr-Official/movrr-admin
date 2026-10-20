// Non-destructive production preflight. No identities, requests or approval records are changed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const postgres = require('postgres');
const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_][A-Z_0-9]*=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db = postgres(env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 15,
  connection: { default_transaction_read_only: 'on', statement_timeout: '20000', application_name: 'movrr-deletion-intake-readonly-preflight' } });
const scopes = ['personal.erase', 'external.erase', 'receipt.complete', 'restore.suppress'];
(async () => {
  try {
    const result = await db.begin('read only', async tx => ({
      inspectedAt: new Date().toISOString(), project: 'kzdvunpuxaxlphqvmzxw',
      readOnly: (await tx`SHOW transaction_read_only`)[0].transaction_read_only,
      contract: (await tx`SELECT public.account_deletion_contract_status() status`)[0].status,
      gate: (await tx`SELECT operating_state,operating_version,requests_enabled,active_policy_version,
        operating_changed_at,operating_changed_by,operating_reason,managed_resources_execution_enabled,
        catalog_digest IS NOT NULL catalog_digest_present,catalog_verified_at IS NOT NULL catalog_verified,
        catalog_review_reference IS NOT NULL catalog_review_reference_present,
        barrier_verified_at IS NOT NULL barrier_verified,disposition_verified_at IS NOT NULL disposition_verified
        FROM public.account_deletion_contract_gate WHERE singleton`)[0],
      policies: await tx`SELECT version,technical_status,legal_status,finance_status,partner_status
        FROM public.account_deletion_policy_version WHERE version=(SELECT active_policy_version FROM public.account_deletion_contract_gate WHERE singleton)`,
      rules: await tx`SELECT scope,technical_status,legal_status,finance_status,partner_status,
        approval_reference IS NOT NULL approval_reference_present,
        public.account_deletion_rule_allowed(policy_version,scope) allowed
        FROM public.account_deletion_action_rule WHERE policy_version=(SELECT active_policy_version FROM public.account_deletion_contract_gate WHERE singleton)
        AND scope IN ('personal.erase','external.erase','receipt.complete','restore.suppress','receipt.delivery') ORDER BY scope`,
      retention: await tx`SELECT category,approval_status,period IS NOT NULL period_present,
        lawful_basis IS NOT NULL lawful_basis_present,start_event,minimum_fields
        FROM public.account_deletion_retention_rule WHERE policy_version=(SELECT active_policy_version FROM public.account_deletion_contract_gate WHERE singleton) ORDER BY category`,
      counts: (await tx`SELECT (SELECT count(*) FROM public.account_deletion_jobs) requests,
        (SELECT count(*) FROM public.account_deletion_receipt_access) receipt_access,
        (SELECT count(*) FROM public.account_deletion_audit) lifecycle_audit,
        (SELECT count(*) FROM public.ops_command_receipt WHERE kind='deletion.intake') intake_command_receipts`)[0],
      functions: await tx`SELECT p.proname,pg_get_functiondef(p.oid) definition,
        has_function_privilege('anon',p.oid,'execute') anon,
        has_function_privilege('authenticated',p.oid,'execute') authenticated,
        has_function_privilege('service_role',p.oid,'execute') service_role
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('set_account_deletion_intake','account_deletion_intake_status','account_deletion_contract_status',
        'ops_assert_capability','establish_account_deletion_barrier','request_verified_account_deletion',
        'request_verified_account_deletion_core','read_account_deletion_lifecycle','read_account_deletion_delivered_receipt',
        'account_deletion_rule_allowed','account_deletion_activation_authorized','account_deletion_intake_ready') ORDER BY p.proname`,
      shop: await tx`SELECT redemption_enabled FROM public.shop_release_control`
    }));
    assert.equal(result.readOnly, 'on');
    result.executionBlockers = [];
    for (const key of ['catalog_digest_present','catalog_verified','catalog_review_reference_present','barrier_verified','disposition_verified'])
      if (!result.gate[key]) result.executionBlockers.push(key);
    for (const scope of scopes) if (!result.rules.some(r => r.scope === scope && r.allowed)) result.executionBlockers.push('policy_rule:' + scope);
    result.separatedIntakeInstalled = result.functions.some(f => f.proname === 'account_deletion_intake_ready');
    result.intakeReady = result.separatedIntakeInstalled ? (await db`SELECT public.account_deletion_intake_ready(${result.gate.active_policy_version}) ready`)[0].ready : false;
    result.blockers = result.separatedIntakeInstalled
      ? (result.intakeReady ? [] : ['intake_contract_and_approved_receipt_access_required'])
      : ['deployed_intake_is_still_coupled_to_execution_approvals'];
    const command = result.functions.find(f => f.proname === 'set_account_deletion_intake');
    const sourceFile = result.separatedIntakeInstalled ? '066_deletion_intake_execution_separation.sql' : '060_account_deletion_intake_control.sql';
    const source = fs.readFileSync(path.join(__dirname, sourceFile), 'utf8');
    const body = source.match(/CREATE (?:OR REPLACE )?FUNCTION public\.set_account_deletion_intake[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1].replace(/\r/g, '').trim();
    result.deployedCommandMatchesSource = command.definition.split('$function$')[1].replace(/\r/g, '').trim() === body;
    result.operatingCommandSource = sourceFile;
    assert(result.deployedCommandMatchesSource, 'Deployed operating command differs from reviewed migration');
    const out = path.join(root, '.tmp/deletion-intake-activation'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'functions.json'), JSON.stringify(result.functions, null, 2) + '\n');
    result.functions = result.functions.map(({ definition, ...f }) => ({ ...f,
      sha256: crypto.createHash('sha256').update(definition.replace(/\r/g, '')).digest('hex') }));
    result.activationAttempted = false;
    fs.writeFileSync(path.join(out, 'production.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await db.end({ timeout: 5 }); }
})().catch(error => { console.error(JSON.stringify({ error: error.code || 'preflight_failed', message: error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]') })); process.exitCode = 1; });
