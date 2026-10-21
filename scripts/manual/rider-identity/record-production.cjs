// Curate production release evidence. Vercel inputs contain no committed tokens.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'docs/verification/rider-identity-activity'),scratch=path.join(repo,'.tmp/rider-activity-rollout-20261021');
const read=p=>{const b=fs.readFileSync(p);return JSON.parse(b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''));};
const doc=f=>read(path.join(out,f)),temp=f=>fs.existsSync(path.join(scratch,f))?read(path.join(scratch,f)):doc('deployment-readback.json')[f];
const migration=doc('activity-applied.json'),correction=doc('correction-applied.json'),before=doc('before-production.json'),after=doc('corrected-production.json'),handler=doc('handler-production.json'),review=doc('verification.json');
const runtime=temp('admin-runtime.json'),project=temp('admin-project-final.json'),alias=temp('admin-alias-final.json'),firewall=temp('admin-firewall-final.json');
const sha='eb32272596cb4d91765af822e19c1557176d101b';
assert.equal(runtime.gitSource.sha,sha);assert.equal(runtime.readyState,'READY');assert.equal(runtime.readySubstate,'PROMOTED');assert.equal(project.targets.production.id,runtime.id);assert.equal(alias.deployment.id,runtime.id);
assert.equal(runtime.autoAssignCustomDomains,false);assert.equal(firewall.firewallEnabled,true);assert.deepEqual(firewall.rules,temp('admin-firewall-before.json').rules);
// Preserve only the inputs needed to reproduce deployment assertions; exclude
// private project configuration and unrelated raw Vercel response fields.
const deploymentInputs={
 'admin-runtime.json':{id:runtime.id,url:runtime.url,gitSource:runtime.gitSource,readyState:runtime.readyState,readySubstate:runtime.readySubstate,autoAssignCustomDomains:runtime.autoAssignCustomDomains},
 'admin-project-final.json':{id:project.id,targets:{production:{id:project.targets.production.id}}},
 'admin-alias-final.json':{deployment:{id:alias.deployment.id}},
 'admin-alias-before.json':{deployment:{id:temp('admin-alias-before.json').deployment.id}},
 'admin-firewall-final.json':{firewallEnabled:firewall.firewallEnabled,rules:firewall.rules},
 'admin-firewall-before.json':{rules:temp('admin-firewall-before.json').rules}
};
fs.writeFileSync(path.join(out,'deployment-readback.json'),JSON.stringify(deploymentInputs,null,2)+'\n');
assert.deepEqual(migration.before,migration.after);assert.equal(migration.sha256,review.approval.activity.sha256Utf8Lf);assert.equal(correction.sha256,review.approval.correction.sha256Utf8Lf);
assert.deepEqual(correction.changed.sort(),['auth.users','public.rider','public.rider_reward_balance','public.user'].sort());
assert.equal(before.counts.users,after.counts.users);assert.equal(after.counts.rider_profiles,before.counts.rider_profiles-1);assert.equal(after.counts.rider_users,before.counts.rider_users-1);assert.equal(before.counts.memberships,after.counts.memberships);
assert.deepEqual(before.memberships,after.memberships);assert.deepEqual(before.gates,after.gates);assert.equal(after.account.riders,0);assert.equal(after.account.balances,0);assert.equal(after.account.role,null);assert.equal(after.account.metadata_role,null);
assert(after.integrity.nonRoutineRowsUnchanged);assert(handler.actualProductionDataSortingAndPagination);assert(handler.partnerOwnerGrants);assert(handler.riderOnlyDenied);assert(handler.mfaBoundary);
assert.equal(handler.relationshipHtml.replace(/<[^>]*>/g,''),'Partner \u00b7 Powerdon \u00b7 Owner');
assert.deepEqual(doc('migration-production.json').activity,after.activity,'Activity changed unexpectedly during read-only acceptance');
const productSource=cp.execFileSync('git',['show',sha+':features/identity/application/productProvisioning.ts'],{cwd:repo,encoding:'utf8'});assert(!productSource.includes('server_assigned_role'));
(async()=>{
 const http=[];
 for(const endpoint of ['/users','/api/dashboard/reads/users?args=%5B%5D']){
  const response=await fetch('https://admin.movrr.nl'+endpoint,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  http.push({path:endpoint,status:response.status,location:response.headers.get('location'),cacheControl:response.headers.get('cache-control')});
  if(endpoint==='/users'){assert([302,303,307,308].includes(response.status));assert(response.headers.get('location')?.includes('auth'));}
  else assert([401,403].includes(response.status)||([302,303,307,308].includes(response.status)&&response.headers.get('location')?.startsWith('/auth/signin')));
 }
 const record={recordedAt:new Date().toISOString(),status:'Approved migration, exact identity correction and pinned Admin deployed; production SQL/RPC/handler/integrity acceptance passed; live authenticated browser acceptance remains unavailable',
  approval:{source:'Explicit owner approval in this conversation for exact README package, migration 080, powerdonnl@gmail.com correction and eb32272 Admin deployment',project:'kzdvunpuxaxlphqvmzxw'},
  migration:{...after.journal.find(j=>j.name==='080_authenticated_account_activity'),appliedAt:migration.recordedAt,sha256Utf8Lf:migration.sha256,existingRowsChanged:0,functions:after.functions.filter(f=>['read_account_activity','retain_deleted_session_activity'].includes(f.proname)),triggerNames:['retain_auth_session_activity','retain_admin_session_activity'],acl:after.activityAcl},
  correction:{sha256Utf8Lf:correction.sha256,appliedAt:correction.recordedAt,userId:after.account.id,email:after.account.email,removedRiderId:'183c4512-228b-441a-9b4f-e1d97359773a',deletedRows:2,updatedRows:2,changedTables:correction.changed,before:before.account,after:after.account,unchangedMembership:after.memberships[0],legacyNullStaffRowPreserved:after.staff,authProviderIdentityPreserved:true,roleGuardRestored:after.triggers.find(t=>t.tgname==='enforce_user_role_immutable_for_clients'),noOtherSecurityTriggerChanges:true,unexpectedDependencies:0},
  deployment:{revision:sha,fixRevision:'aa1e3eb',id:runtime.id,url:'https://'+runtime.url,domain:'https://admin.movrr.nl',projectId:project.id,previousDeployment:temp('admin-alias-before.json').deployment.id,state:runtime.readyState,substate:runtime.readySubstate,productionTargetAndAliasVerified:true,sourceIsPinnedGitNotWorkingTree:true,autoAssignCustomDomainsDuringBuild:false,firewallEnabled:true,firewallRulesUnchanged:true},
  identity:{label:'Partner · Powerdon · Owner',representationVerified:'Actual source UserRelationships render with the production Users DTO',riderLookupReturnsNull:true,riderOnlyCapabilitiesDenied:['wallet.read','rewards.redeem'],partnerOwnerCapabilities:after.identity.permissions,ownerRlsAllowed:true,otherTenantDenied:true,accountActive:true,statusAndMembershipUnchanged:true,realAccountLoginPerformed:false},
  activity:{definition:review.activityDefinition,accountValue:null,accountDisplay:'No recorded activity',staffEditsExcluded:true,allAccountTimestampsIndependentlyReconciled:true,accountsChecked:handler.activityAccountCount,activityProjectionUnchangedByCorrectionAndReads:true,actualProductionDataSortingPagination:true,refreshDoesNotInventActivity:true,logoutRetention:'Exact installed trigger bodies and ACL verified against tested source; real GoTrue login/refresh/logout passed locally. No production session was logged out or synthesized.',accountSwitching:'Approved session-cache isolation regression passed again; no live production account switch performed.'},
  integrity:{tablesVerified:Object.keys(migration.before).length,migrationAllExistingRowsUnchanged:true,correctionOnlyExactIdentityChanged:true,otherAccountsWithinFourChangedTablesUnchanged:true,allOtherTablesUnchangedInsideCorrection:true,postCorrectionChanges:after.integrity.changesSinceCorrection,postCorrectionExplanation:after.integrity.explanation,countsBefore:before.counts,countsAfter:after.counts,gates:after.gates},
  verification:{productionReadOnlyTestsPassed:5,postReleaseFocusedTestsPassed:18,priorFullSuitePassed:979,priorFinalSqlAuthPostgrestChecksPassed:15,typecheckAndConfiguredLint:'passed',approvedProductionBuild:'Vercel READY',anonymousHttp:http,metadataWriterRetired:true,compatibilityFallbackAdded:false},
  boundaries:{syntheticProductionAccounts:0,productionFinancialTransactions:0,productionSessionLoginsOrLogouts:0,mobileRuntimeChanged:false,webDeploymentChanged:false,cleanupExecutedOrRepinned:false,unrelatedAccountsChangedByCorrection:false},
  browserAcceptance:{status:'Unavailable',evidence:['Chrome DevTools: no DevToolsActivePort for the existing Chrome profile','Computer-use inventory: apps=[], browsers=[]'],remaining:['Live signed-in Admin table and User Details visual acceptance','Partner Owner login in the real account session','Production login/normal use/logout and live account switching'],noRepeatedConnectionRetries:true,noSessionOrCredentialsFabricated:true},
  evidenceFiles:['before-production.json','activity-applied.json','migration-production.json','correction-applied.json','corrected-production.json','handler-production.json']};
 fs.writeFileSync(path.join(out,'production.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({status:record.status,migration:record.migration.version,checksum:record.migration.sha256Utf8Lf,deployment:record.deployment,identity:record.identity.label,integrity:record.integrity},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
