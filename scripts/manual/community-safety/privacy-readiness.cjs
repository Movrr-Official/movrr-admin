// READ ONLY. Eligibility/registry evidence, never a disposal-worker invocation.
const fs=require('node:fs'),path=require('node:path'),postgres=require('postgres'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/community-safety-production-20261023');
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
assert(new URL(env.DATABASE_URL).username.endsWith('.kzdvunpuxaxlphqvmzxw'));
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,onnotice(){},connection:{default_transaction_read_only:'on',application_name:'movrr-safety-privacy-readiness-read-only'}});
(async()=>{
 const result=await db.begin('read only',async tx=>({
  rules:await tx`SELECT category,period::text,start_event,minimum_fields,access_capability,approval_status FROM account_deletion_retention_rule WHERE policy_version=(SELECT active_policy_version FROM account_deletion_contract_gate WHERE singleton) AND category IN ('community_reports','community_moderation') ORDER BY category`,
  unresolvedReports:(await tx`SELECT count(*)::int n FROM community_report WHERE status='open'`)[0].n,
  reportsDue:(await tx`SELECT count(*)::int n FROM community_report WHERE resolved_at+interval '12 months'<=now()`)[0].n,
  casesDue:(await tx`SELECT count(*)::int n FROM community_safety_case WHERE closed_at+interval '24 months'<=now()`)[0].n,
  unreferencedCleanupCandidates:(await tx`SELECT count(*)::int n FROM community_cover_disposal t WHERE confirmed_at IS NULL AND NOT EXISTS(SELECT 1 FROM community_ride c WHERE c.cover_image_path=t.path)`)[0].n,
  closedPublicationCases:(await tx`SELECT count(*)::int n FROM community_safety_case WHERE closed_at IS NOT NULL AND reopened_at IS NULL`)[0].n,
  retainedContentSnapshots:(await tx`SELECT count(*)::int n FROM community_moderation_audit WHERE evidence<>'{}'`)[0].n,
  activeHolds:(await tx`SELECT count(*)::int n FROM account_deletion_hold WHERE community_case_id IS NOT NULL AND released_at IS NULL`)[0].n,
  gates:(await tx`SELECT requests_enabled,managed_resources_execution_enabled FROM account_deletion_contract_gate WHERE singleton`)[0]
 }));assert.equal(result.rules.length,2);assert(result.rules.every(r=>r.approval_status==='approved'));assert.equal(result.reportsDue,0);assert.equal(result.casesDue,0);assert.equal(result.unreferencedCleanupCandidates,0);assert.equal(result.retainedContentSnapshots,0);assert.equal(result.gates.managed_resources_execution_enabled,false);
 result.recordedAt=new Date().toISOString();result.disposalWorkerInvoked=false;result.scheduledJobsActivated=false;result.additionalArticle9Or10AuthorityEstablished=false;
 fs.writeFileSync(path.join(out,'privacy-readiness.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());
