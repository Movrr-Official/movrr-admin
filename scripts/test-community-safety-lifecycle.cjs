// Real PostgreSQL synthetic cases. Policy approvals below are isolated test
// fixtures only; no production approval/reference or worker activation is made.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async({db,owner,outsider,admin,create,review,report,as})=>{
 let n=0;const equal=(a,b)=>{assert.deepEqual(a,b);n++},id=()=>crypto.randomUUID();
 const deny=async fn=>{await assert.rejects(fn,e=>e.code==='42501');n++};
 const ride=await create();await review(ride);
 const reportId=await report(ride,'ride',outsider);
 let r=(await db`SELECT * FROM community_report WHERE id=${reportId}`)[0];
 equal(r.resolved_at,null);equal(r.evidence.organizer_name,undefined);equal(r.evidence.meeting_point_address,undefined);equal(r.evidence.cover_image_path,undefined);
 await deny(()=>as(outsider,tx=>tx`SELECT * FROM community_safety_case`));
 await review((await db`SELECT * FROM community_ride WHERE id=${ride.id}`)[0],'dismiss',r);
 r=(await db`SELECT * FROM community_report WHERE id=${reportId}`)[0];equal(r.status,'dismissed');equal(r.resolved_at instanceof Date,true);
 await deny(()=>db`UPDATE community_report SET resolved_at=now()-interval '1 year' WHERE id=${reportId}`);
 const command=async(action,extra={})=>{
  const c=(await db`SELECT * FROM community_safety_case WHERE id=${reportId}`)[0];
  const op=extra.operation??id();
  await as(null,tx=>tx`SELECT command_community_safety_case(${op},${admin},${reportId},${extra.version??c.version},${action},'Necessary synthetic case decision',${extra.hold??null},${extra.authority??null},${extra.review??null},${extra.policy??null},${extra.retain??false})`,'service_role');
  return op;
 };
 await deny(()=>command('close',{retain:true}));
 const op=await command('close');const closed=(await db`SELECT * FROM community_safety_case WHERE id=${reportId}`)[0];
 equal(closed.closed_at instanceof Date,true);equal(closed.first_review_at instanceof Date,true);
 equal((await db`SELECT evidence FROM community_moderation_audit WHERE case_id=${reportId}`)[0].evidence,{});
 await command('close',{operation:op,version:1}); // Identical uncertain-result retry.
 equal((await db`SELECT count(*)::int n FROM community_safety_event WHERE operation_id=${op}`)[0].n,1);
 await command('reopen');await command('close');equal((await db`SELECT closed_at FROM community_safety_case WHERE id=${reportId}`)[0].closed_at,closed.closed_at);
 await command('deletion_clearance');
 let clearance=(await db`SELECT * FROM community_safety_case WHERE id=${reportId}`)[0];
 equal(clearance.deletion_cleared_version,clearance.version);
 equal((await db`SELECT evidence FROM community_report WHERE id=${reportId}`)[0].evidence,{});
 await command('reopen');
 equal((await db`SELECT deletion_cleared_version FROM community_safety_case WHERE id=${reportId}`)[0].deletion_cleared_version,null);
 await command('close');
 const exported=(await as(outsider,tx=>tx`SELECT my_community_safety_export() data`))[0].data;
 equal(exported.reports.some(x=>x.id===reportId),true);equal(JSON.stringify(exported).includes('reporter_user_id'),false);equal(JSON.stringify(exported).includes('cover_image_path'),false);
 const inventory=(await as(null,tx=>tx`SELECT community_safety_deletion_inventory(${outsider}) data`,'service_role'))[0].data;
 equal(inventory.reports.includes(reportId),true);await deny(()=>as(outsider,tx=>tx`SELECT community_safety_deletion_inventory(${owner})`));
 const disposal=id();await deny(()=>as(null,tx=>tx`SELECT dispose_community_safety(${disposal},${reportId},900001)`,'service_role'));
 // Canonical registry constraints, with deliberately labelled synthetic approval.
 await db`INSERT INTO account_deletion_policy_version(version,contract_version,direction,technical_status,legal_status,finance_status,partner_status) VALUES(900001,1,'{}','approved','approved','approved','approved')`;
 for(const [category,months,start,fields] of [
  ['community_reports',12,'report_resolution',['case_id','category','timestamps','outcome','reporter_reference','subject_reference','description','evidence.title','evidence.description','evidence.cover_image_path','evidence.moderation_version']],
  ['community_moderation',24,'case_closure',['case_id','decision','reviewer','timestamps','disposal.operation_id','disposal.case_digest','disposal.counts','disposal.timestamps']],
 ]) await db`INSERT INTO account_deletion_retention_rule(policy_version,category,purpose,owner,minimum_fields,lawful_basis,period,start_event,access_capability,expiry_mechanism,hold_review_policy,approval_status,approval_reference)
 VALUES(900001,${category},'Isolated test only','Synthetic Privacy',${fields},'SYNTHETIC fixture, not a legal determination',${months+' months'}::interval,${start},'community.manage','controlled_test','explicit_release','approved','ISOLATED-SYNTHETIC-NOT-PRODUCTION')`;
 // Receipts use the original case deadline, never a new post-disposal period.
 // A nominal approval cannot omit identifiers actually present in the report.
 await db`INSERT INTO account_deletion_policy_version(version,contract_version,direction,technical_status,legal_status,finance_status,partner_status) VALUES(900002,1,'{}','approved','approved','approved','approved')`;
 await db.unsafe(`INSERT INTO account_deletion_retention_rule(policy_version,category,purpose,owner,minimum_fields,lawful_basis,period,start_event,access_capability,expiry_mechanism,hold_review_policy,approval_status,approval_reference)
 SELECT 900002,category,purpose,owner,array_remove(minimum_fields,'reporter_reference'),lawful_basis,period,start_event,access_capability,expiry_mechanism,hold_review_policy,approval_status,approval_reference FROM account_deletion_retention_rule WHERE policy_version=900001`);
 await db`UPDATE account_deletion_contract_gate SET active_policy_version=900002 WHERE singleton`;
 await deny(()=>as(null,tx=>tx`SELECT dispose_community_safety(${id()},${reportId},900002)`,'service_role'));
 await db`UPDATE account_deletion_contract_gate SET active_policy_version=900001 WHERE singleton`;
 await command('reopen');
 await deny(()=>command('close',{retain:true,policy:900001}));
 await command('ordinary_evidence');
 clearance=(await db`SELECT * FROM community_safety_case WHERE id=${reportId}`)[0];
 equal(clearance.ordinary_evidence_reviewed_version,clearance.version);
 await command('close',{retain:true,policy:900001});
 equal((await db`SELECT closed_at FROM community_safety_case WHERE id=${reportId}`)[0].closed_at,closed.closed_at);
 equal((await as(null,tx=>tx`SELECT dispose_community_safety(${id()},${reportId},900001) data`,'service_role'))[0].data.state,'not_due');
 const hold=id();await command('hold',{hold,authority:'Synthetic isolated hold authorisation',review:new Date(Date.now()+86400000)});
 await deny(()=>command('minimise'));
 await deny(()=>command('deletion_clearance'));
 await command('reopen');
 await deny(()=>command('close'));
 equal((await db`SELECT count(*)::int n FROM account_deletion_hold WHERE id=${hold} AND released_at IS NULL`)[0].n,1);
 // Advance the fixture clocks without introducing any production test-time switch.
 await db.unsafe('ALTER TABLE community_report DISABLE TRIGGER community_report_clock');
 await db`UPDATE community_report SET resolved_at=clock_timestamp()-interval '13 months' WHERE id=${reportId}`;
 await db.unsafe('ALTER TABLE community_report ENABLE TRIGGER community_report_clock');
 equal((await as(null,tx=>tx`SELECT dispose_community_safety(${id()},${reportId},900001) data`,'service_role'))[0].data.state,'held');
 equal((await db`SELECT count(*)::int n FROM community_report WHERE id=${reportId}`)[0].n,1);
 await command('release',{hold});
 const expired=(await as(null,tx=>tx`SELECT dispose_community_safety(${disposal},${reportId},900001) data`,'service_role'))[0].data;
 equal(expired.reports,1);equal(expired.decisions,0);
 equal((await db`SELECT count(*)::int n FROM community_report WHERE id=${reportId}`)[0].n,0);
 equal((await db`SELECT count(*)::int n FROM community_moderation_audit WHERE case_id=${reportId}`)[0].n,1);
 equal((await as(null,tx=>tx`SELECT dispose_community_safety(${disposal},${reportId},900001) data`,'service_role'))[0].data,expired);
 const receipt=(await db`SELECT * FROM community_safety_disposal_receipt WHERE operation_id=${disposal}`)[0];
 equal(receipt.completed_at instanceof Date,true);
 equal(receipt.created_at instanceof Date,true);
 equal((await db`SELECT expires_at=closed_at+interval '24 months' matches FROM community_safety_disposal_receipt,community_safety_case WHERE operation_id=${disposal} AND id=${reportId}`)[0].matches,true);
 await db`UPDATE community_safety_case SET closed_at=clock_timestamp()-interval '25 months' WHERE id=${reportId}`;
 const complete=(await as(null,tx=>tx`SELECT dispose_community_safety(${id()},${reportId},900001) data`,'service_role'))[0].data;
 equal(complete.decisions,1);equal((await db`SELECT count(*)::int n FROM community_safety_case WHERE id=${reportId}`)[0].n,0);
 equal((await db`SELECT count(*)::int n FROM community_safety_event WHERE case_id=${reportId}`)[0].n,0);
 equal((await as(null,tx=>tx`SELECT expire_community_safety_receipts(900001) n`,'service_role'))[0].n,1);
 equal((await db`SELECT count(*)::int n FROM community_safety_disposal_receipt WHERE operation_id=${disposal}`)[0].n,1);
 await deny(()=>as(outsider,tx=>tx`SELECT claim_community_cover_disposal(${disposal})`));
 return n;
};
