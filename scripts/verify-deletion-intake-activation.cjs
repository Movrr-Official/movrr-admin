// Read-only proof of the genuine MFA Admin activation. Never issues a command or supplies an actor.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),postgres=require('postgres');
const root=path.resolve(__dirname,'..'),env=Object.fromEntries(fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_][A-Z_0-9]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:15,connection:{default_transaction_read_only:'on',statement_timeout:'20000',application_name:'movrr-intake-activation-readonly-proof'}});
(async()=>{try{
 const r=await db.begin('read only',async tx=>({
  checkedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw',readOnly:(await tx`SHOW transaction_read_only`)[0].transaction_read_only,
  gate:(await tx`SELECT operating_state,operating_version,operating_changed_at,operating_changed_by,operating_reason,active_policy_version,managed_resources_execution_enabled FROM public.account_deletion_contract_gate WHERE singleton`)[0],
  contract:(await tx`SELECT public.account_deletion_contract_status() status`)[0].status,
  intakeReady:(await tx`SELECT public.account_deletion_intake_ready(active_policy_version) ready FROM public.account_deletion_contract_gate WHERE singleton`)[0].ready,
  mfaEnforced:(await tx`SELECT coalesce((SELECT (value->>'enforceAdminMfa')::boolean FROM public.platform_settings WHERE key='security'),true) enforced`)[0].enforced,
  activation:await tx`SELECT c.operation,c.actor_user_id,c.created_at command_recorded_at,c.payload,c.result,a.id audit_id,a.created_at audit_recorded_at,a.previous_state,a.resulting_state,a.reason,u.role::text actor_role
   FROM public.ops_command_receipt c JOIN public.platform_audit_record a ON a.correlation_id=c.operation::text AND a.actor_user_id=c.actor_user_id
   JOIN public.admin_users u ON u.user_id=c.actor_user_id JOIN public.account_deletion_contract_gate g ON g.singleton
   WHERE c.kind='deletion.intake' AND c.result->>'state'='enabled' AND a.capability='settings.security' AND a.target_entity_type='account_deletion_intake'
   AND (c.result->>'version')::bigint=g.operating_version AND c.actor_user_id=g.operating_changed_by ORDER BY c.created_at DESC`,
  counts:(await tx`SELECT (SELECT count(*) FROM public.account_deletion_jobs) requests,(SELECT count(*) FROM public.account_deletion_receipt_access) receipt_access,(SELECT count(*) FROM public.account_deletion_review) reviews,(SELECT count(*) FROM public.account_deletion_audit) lifecycle_audit`)[0],
  shop:await tx`SELECT redemption_enabled FROM public.shop_release_control`
 }));
 assert.equal(r.readOnly,'on');assert.equal(r.intakeReady,true);assert.equal(r.gate.managed_resources_execution_enabled,false);assert(r.shop.every(s=>s.redemption_enabled===false));
 r.activationVerified=false;
 if(r.gate.operating_state==='enabled'){
  assert.equal(r.contract.requestsEnabled,true);assert.equal(r.mfaEnforced,true);assert.equal(r.activation.length,1);
  const a=r.activation[0];assert(['super_admin','security_admin'].includes(a.actor_role));assert.equal(a.result.changedBy,r.gate.operating_changed_by);
  assert.equal(a.result.version,Number(r.gate.operating_version));assert.equal(a.payload.expected,Number(r.gate.operating_version)-1);
  assert.equal(a.previous_state.version,a.payload.expected);assert.equal(a.resulting_state.version,a.result.version);
  assert.equal(a.reason,r.gate.operating_reason);assert.deepEqual(a.resulting_state,a.result);
  assert.equal(a.payload.state,'enabled');assert.equal(a.result.policyVersion,2);r.activationVerified=true;
 }
 const out=path.join(root,'.tmp/intake-execution-separation');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'activation.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));
 }finally{await db.end({timeout:5});}})().catch(e=>{console.error(JSON.stringify({error:e.code||e.name,message:e.message}));process.exitCode=1;});
