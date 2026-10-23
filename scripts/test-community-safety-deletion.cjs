// Called inside a rollback-only canonical-schema transaction. Synthetic approval
// rows exercise source support; they never stand for a production approval.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async({tx,user,viewer,ride,report,held=false})=>{
 let n=0;const equal=(a,b)=>{assert.deepEqual(a,b);n++},id=()=>crypto.randomUUID();
 const before=JSON.parse(JSON.stringify(await tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${ride} ORDER BY rider_id`));
 const financial=(await tx`SELECT count(*)::int n FROM reward_transactions`)[0].n;
 const manifest=(await tx`SELECT community_safety_deletion_manifest() m`)[0].m;
 for(const entity of manifest){
  const actual=await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${entity.table}`;
  equal([...entity.columns].sort(),actual.map(x=>x.column_name).sort());
 }
 await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;
 const r=(await tx`SELECT * FROM community_report WHERE id=${report}`)[0];
 await tx`SELECT moderate_community_content(${id()},${user},${ride},1,'dismiss','Synthetic ordinary case review',${report},${r.version})`;
 async function command(action,hold=null){
  const c=(await tx`SELECT * FROM community_safety_case WHERE id=${report}`)[0];
  await tx`SELECT command_community_safety_case(${id()},${user},${report},${c.version},${action},'Synthetic disposition review',${hold},${hold?'ISOLATED hold, not production':null},${hold?new Date(Date.now()+86400000):null})`;
 }
 await command('close');await command('deletion_clearance');
 if(held)await command('hold',id());
 await tx`INSERT INTO account_deletion_policy_version(version,contract_version,direction,technical_status,legal_status,finance_status,partner_status) VALUES(900003,1,'{}','approved','approved','approved','approved')`;
 await tx`INSERT INTO account_deletion_action_rule(policy_version,scope,legal_status,finance_status,partner_status,approval_reference,parameters)
 VALUES(900003,'personal.erase','approved','not_required','not_required','ISOLATED-SYNTHETIC-NOT-PRODUCTION','{}')`;
 const job=id(),token=id();
 await tx`INSERT INTO account_deletion_jobs(id,user_id,policy_version) VALUES(${job},${viewer},900003)`;
 await tx`UPDATE account_deletion_jobs SET status='processing',lease_token=${token},lease_until=clock_timestamp()+interval '5 minutes' WHERE id=${job}`;
 let gate=(await tx`SELECT prepare_account_deletion_community_safety(${job},${token}) r`)[0].r;
 equal(gate.state,'review'); // An approval without the exact manifest is insufficient.
 // Immutable policy rows are changed ONLY in this rollback test fixture.
 await tx.unsafe('ALTER TABLE account_deletion_action_rule DISABLE TRIGGER account_deletion_action_rule_immutable');
 await tx`UPDATE account_deletion_action_rule SET parameters=jsonb_build_object('communitySafetyManifest',community_safety_deletion_manifest()) WHERE policy_version=900003 AND scope='personal.erase'`;
 await tx.unsafe('ALTER TABLE account_deletion_action_rule ENABLE TRIGGER account_deletion_action_rule_immutable');
 if(!held){
  await assert.rejects(()=>tx.savepoint(s=>s`SELECT prepare_account_deletion_community_safety(${job},${token})`),e=>e.code==='42501' && e.message==='destructive_processing_disabled');n++;
  // Existing execution gate is enabled ONLY in this rollback-only fixture.
  await tx`UPDATE account_deletion_contract_gate SET managed_resources_execution_enabled=true WHERE singleton`;
 }
 gate=(await tx`SELECT prepare_account_deletion_community_safety(${job},${token}) r`)[0].r;
 equal(gate.state,held?'review':'confirmed');equal(gate.completionAuthorized,false);
 equal((await tx`SELECT count(*)::int n FROM community_report WHERE id=${report}`)[0].n,held?1:0);
 if(!held){
  equal((await tx`SELECT prepare_account_deletion_community_safety(${job},${token}) r`)[0].r,gate);
  equal((await tx`SELECT count(*)::int n FROM community_safety_case WHERE id=${report}`)[0].n,0);
  equal((await tx`SELECT count(*)::int n FROM community_safety_event WHERE case_id=${report}`)[0].n,0);
 }
 equal(JSON.parse(JSON.stringify(await tx`SELECT * FROM community_ride_participant WHERE community_ride_id=${ride} ORDER BY rider_id`)),before);
 equal((await tx`SELECT count(*)::int n FROM reward_transactions`)[0].n,financial);
 return n;
};
