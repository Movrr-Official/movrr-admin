// Explicitly authorized production activation verification. Synthetic identities
// only; never accepts an organisation invitation or changes a membership.
// Secrets and authentication links remain in memory, never in evidence or logs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {createClient}=require('@supabase/supabase-js'),{createServerClient}=require('@supabase/ssr'),{JSDOM}=require('jsdom');
const postgres=require('postgres'),ts=require('typescript'),Module=require('node:module');
const managed=new Module(path.resolve('lib/managedWritePermit.cjs'),module);managed.filename=path.resolve('lib/managedWritePermit.cjs');managed.paths=module.paths;
managed._compile(ts.transpileModule(fs.readFileSync('lib/managedWritePermit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,managed.filename);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(new URL(url).hostname,'kzdvunpuxaxlphqvmzxw.supabase.co');
const out='docs/verification/account-access-activation-20261028';fs.mkdirSync(out,{recursive:true});
const manifestFile=path.join(out,'synthetic-fixture.json');
const fixture=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{runId:crypto.randomUUID(),organisationId:crypto.randomUUID(),accounts:{}};
if(!fixture.accounts.operator&&fixture.retiredOperators?.length)fixture.accounts.operator=fixture.retiredOperators.at(-1);
fixture.emails??={};
const setupKey='setup-2',invitationKey='invitation-2';
for(const which of [setupKey,invitationKey]){fixture.emails[which]=`delivered+movrr-${fixture.runId.slice(0,12)}-${which}@resend.dev`;assert(fixture.emails[which].split('@')[0].length<=64);}
const save=()=>fs.writeFileSync(manifestFile,JSON.stringify(fixture,null,2)+'\n');save();
const evidence={startedAt:new Date().toISOString(),project:'kzdvunpuxaxlphqvmzxw',emailOtpExpirySeconds:3600,expiryConfirmation:'User verified directly in production Supabase Dashboard',checks:{},emails:[],affectedUserContacted:false};
const must=(value,code)=>{if(!value)throw new Error(code);};
const db=postgres(process.env.DATABASE_URL,{ssl:'require',max:1,onnotice(){},connection:{application_name:'movrr-authorized-synthetic-account-access-e2e',statement_timeout:'30000'}});
let rootActor,rootClient,operator,preexisting,ownBefore;const jars=[];
const raw=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
async function rpc(name,args){const r=await rootClient.rpc(name,args);must(!r.error,`${name}:${r.error?.code||'failed'}`);return r.data;}
function sessionClient(){const jar=new Map();jars.push(jar);const client=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(c=>c.value?jar.set(c.name,c.value):jar.delete(c.name))}});return{client,jar};}
const cookie=jar=>[...jar].map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('; ');
function absorb(response,jar){for(const line of response.headers.getSetCookie()){const pair=line.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),decodeURIComponent(pair.slice(i+1)));}}
async function request(origin,pathname,jar,init={}){const response=await fetch(new URL(pathname,origin),{...init,headers:{...(jar?{Cookie:cookie(jar)}:{}),...init.headers},redirect:'manual',signal:AbortSignal.timeout(45000)});if(jar)absorb(response,jar);return response;}
async function provision(which,kind,input){
 const email=fixture.emails[which]??`delivered+movrr-access-${fixture.runId}-${which}@resend.dev`;
 input={...input,email,name:`MOVRR synthetic recovery ${which} ${fixture.runId.slice(0,8)}`,status:'active',isVerified:true,languagePreference:'en',accountNotes:'Synthetic account access activation verification; never a customer.'};
 if(kind==='employee')input.sendWelcomeEmail=false;
 if(fixture.accounts[which]){const id=fixture.accounts[which],user=await raw.auth.admin.getUserById(id);must(user.data.user?.email===email,'fixture_identity_mismatch');if(user.data.user.banned_until&&Date.parse(user.data.user.banned_until)>Date.now())must(!(await rootClient.auth.admin.updateUserById(id,{ban_duration:'none'})).error,'fixture_unban_failed');if(kind==='employee'){const role=(await db`select role from public.admin_users where user_id=${id}`)[0]?.role;if(role!==input.role)await rpc('assign_employee_role',{p_actor:rootActor,p_user:id,p_role:input.role,p_expected_role:role??null});}return id;}
 const name=kind==='employee'?'provision_employee':'provision_external_account';
 const reservation=await rpc(name,{p_actor:rootActor,p_input:input,p_phase:'reserve'});
 const id=reservation.user_id;fixture.accounts[which]=id;save();
 const created=await rootClient.auth.admin.createUser({id,email,email_confirm:true,ban_duration:'876000h',app_metadata:{[kind==='employee'?'employee_provisioning_id':'external_account_provisioning_id']:id},user_metadata:{full_name:input.name}});
 must(!created.error&&created.data.user?.id===id,'synthetic_auth_create_failed');
 await rpc(name,{p_actor:rootActor,p_input:input,p_phase:'persist'});
 must(!(await rootClient.auth.admin.updateUserById(id,{ban_duration:'none'})).error,'synthetic_auth_activate_failed');
 await rpc(name,{p_actor:rootActor,p_input:input,p_phase:'complete'});return id;
}
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.replace(/=+$/,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=crypto.createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[19]&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
async function login(id,mfa=false){const user=await raw.auth.admin.getUserById(id);const link=await rootClient.auth.admin.generateLink({type:'recovery',email:user.data.user.email});must(!link.error&&link.data.user.id===id,'synthetic_login_link_failed');const session=sessionClient();const verify=await session.client.auth.verifyOtp({type:'recovery',token_hash:link.data.properties.hashed_token});must(!verify.error,'synthetic_login_failed');if(mfa){const enrolled=await session.client.auth.mfa.enroll({factorType:'totp',friendlyName:`Recovery verification ${Date.now()}`});must(!enrolled.error,'synthetic_mfa_enroll_failed');const verified=await session.client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});must(!verified.error,'synthetic_mfa_verify_failed');must((await session.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel==='aal2','synthetic_mfa_not_aal2');}return session;}
async function actions(jar){const response=await request('https://admin.movrr.nl','/users',jar);must(response.status===200,`users_page_${response.status}`);const html=await response.text(),doc=new JSDOM(html).window.document;const files=[...new Set([...doc.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')).filter(s=>s.startsWith('/_next/static/')&&s.includes('.js')))];const found={};for(const file of files){const text=await(await request('https://admin.movrr.nl',file,null)).text();for(const name of ['getAccountAccess','sendAccountAccess']){const expression=new RegExp('createServerReference\\)\\("([a-f0-9]{40,42})",[^)]{0,250}?"'+name+'"\\)','g');for(const match of text.matchAll(expression))found[name]=match[1];}}must(found.getAccountAccess&&found.sendAccountAccess&&found.getAccountAccess!==found.sendAccountAccess,'deployed_recovery_action_ids_missing');return found;}
async function action(ids,name,args,jar){const response=await request('https://admin.movrr.nl','/users',jar,{method:'POST',headers:{Origin:'https://admin.movrr.nl','Next-Action':ids[name],'Content-Type':'text/plain;charset=UTF-8',Accept:'text/x-component'},body:JSON.stringify(args)});if(!jar&&[302,303,307,308].includes(response.status)&&(response.headers.get('location')||response.headers.get('x-action-redirect')||'').includes('/auth/signin'))return{success:false,unauthenticatedRedirect:true};const text=await response.text();const line=text.split('\n').find(l=>/^1:\{/.test(l));must(line,`action_${name}_http_${response.status}`);return JSON.parse(line.slice(2));}
async function confirm(setupUrl,expected){const parsed=new URL(setupUrl);must(parsed.origin==='https://app.movrr.nl'&&parsed.pathname==='/auth/confirm','unapproved_setup_destination');const jar=new Map();const page=await request(parsed.origin,parsed.pathname+parsed.search,jar);must(page.status===200,'setup_confirm_get_failed');const doc=new JSDOM(await page.text()).window.document,form=doc.querySelector('form');must(form,'setup_confirm_form_missing');const data=new FormData();for(const input of form.querySelectorAll('input[name]'))data.append(input.name,input.value);const result=await request(parsed.origin,parsed.pathname+parsed.search,jar,{method:'POST',headers:{Origin:parsed.origin},body:data});const location=result.headers.get('location')||'';must([302,303,307,308].includes(result.status)&&location.includes(expected),`setup_confirmation_expected_${expected.replace(/[^a-z]/gi,'_')}`);return jar;}
async function receipt(target){const rows=await db`select resulting_state from public.platform_audit_record where reason='account_access.outcome' and target_entity_id=${target} order by created_at desc limit 1`;must(rows[0]?.resulting_state.deliveryState==='accepted','submission_not_audited');const id=rows[0].resulting_state.providerId;let email;for(let n=0;n<12;n++){const response=await fetch('https://api.resend.com/emails/'+id,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`}});must(response.ok,'provider_receipt_read_failed');email=await response.json();if(email.last_event==='delivered')break;await new Promise(resolve=>setTimeout(resolve,3000));}must(email.last_event==='delivered','synthetic_delivery_not_confirmed');const setup=(email.text||'').match(/Set up account: (https:\/\/[^\s]+)/)?.[1];must(setup,'setup_link_missing_in_email');must(email.to.every(address=>address.endsWith('@resend.dev')),'unexpected_real_recipient');evidence.emails.push({target,providerId:id,event:email.last_event,syntheticRecipient:true,containsOrganisationName:email.text.includes('MOVRR synthetic recovery verification'),containsExpiry:email.text.includes('60 minutes')});return setup;}
(async()=>{try{
 const actor=(await db`select a.user_id from public.admin_users a where a.role='super_admin' and public.account_identity_active(a.user_id) and a.user_id<>all(${Object.values(fixture.accounts)}) limit 1`)[0];must(actor,'authorizing_admin_unavailable');rootActor=actor.user_id;
 const coordinated=managed.exports.coordinatedManagedFetch({rpc:(name,args)=>raw.rpc(name,args),actor:async()=>rootActor});
 rootClient=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{fetch:async(input,init)=>{
  let req=new Request(input,init);
  // The fixture's MFA-factor DELETE has a JSON content type but no payload.
  // Normalize it before the existing managed-write coordinator parses JSON.
  if(req.method==='DELETE'&&req.headers.get('content-type')?.includes('application/json')&&!(await req.clone().text()))req=new Request(req,{body:'{}'});
  return coordinated(req);
 }}});
 preexisting=await db`select id,md5(to_jsonb(m)::text) digest from public.organisation_membership m where organisation_id<>${fixture.organisationId} order by id`;
 await db`insert into public.organisation(id,name,type,status) values(${fixture.organisationId},'MOVRR synthetic recovery verification','reward_partner','active') on conflict(id) do nothing`;
 operator=await provision(fixture.operatorGeneration>1?`operator-${fixture.operatorGeneration}`:'operator','employee',{role:'super_admin'});
 const setupTarget=await provision(setupKey,'external',{domain:'partner',organisationId:fixture.organisationId,role:'viewer',membershipStatus:'active'});
 const inviteTarget=await provision(invitationKey,'external',{domain:'partner',organisationId:fixture.organisationId,role:'owner',membershipStatus:'invited'});
 ownBefore=await db`select id,md5(to_jsonb(m)::text) digest from public.organisation_membership m where organisation_id=${fixture.organisationId} order by id`;
 const member=(await db`select updated_at::text from public.organisation_membership where user_id=${inviteTarget} and organisation_id=${fixture.organisationId}`)[0];
 const prior=await db`select id from public.platform_invitations where scope='organisation' and target_entity_id=${fixture.organisationId} and email=${fixture.emails[invitationKey]} and status='pending'`;
 if(!prior.length)await rpc('issue_organisation_invitation',{p_actor:rootActor,p_user:inviteTarget,p_organisation:fixture.organisationId,p_role:'owner',p_token_hash:crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),p_expected:member.updated_at});
 const previousFactors=await rootClient.auth.admin.mfa.listFactors({userId:operator});
 for(const factor of previousFactors.data?.factors??[]){must((factor.friendly_name??'').startsWith('Recovery verification'),'unexpected_synthetic_mfa_factor');must(!(await rootClient.auth.admin.mfa.deleteFactor({userId:operator,id:factor.id})).error,'synthetic_mfa_cleanup_failed');}
 const session=await login(operator,true);evidence.checks.realOperatorMfa=true;
 const ids=await actions(session.jar);evidence.checks.deployedActionReferences=true;
 const state=await action(ids,'getAccountAccess',[setupTarget],session.jar);must(state.success&&state.data.recoveryEnabled===true&&state.data.memberships[0].canSend,'production_gate_not_enabled');must(state.data.lastSignInAt===null,'synthetic_setup_already_signed_in');evidence.checks.productionFeatureGate=true;evidence.checks.sendSetupLinkEligible=true;evidence.setupCredentialPresent=state.data.hasPassword;
 const invState=await action(ids,'getAccountAccess',[inviteTarget],session.jar);must(invState.success&&invState.data.memberships[0].invitationStatus==='pending'&&invState.data.memberships[0].canSend,'resend_not_eligible');evidence.checks.resendInvitationEligible=true;
 const noAuth=await action(ids,'sendAccountAccess',[setupTarget,fixture.organisationId],null);must(noAuth.success===false,'unauthenticated_send_allowed');evidence.checks.unauthenticatedDenied=true;
 const denied=await raw.rpc('begin_account_access',{p_actor:setupTarget,p_user:inviteTarget,p_organisation:fixture.organisationId,p_attempt:crypto.randomUUID(),p_token_hash:'a'.repeat(64)});must(denied.error?.code==='42501','organisation_principal_not_denied');evidence.checks.organisationPrincipalDenied=true;
 const ops=(await db`select user_id from public.admin_users where role='operations_manager' and public.account_identity_active(user_id) limit 1`)[0];
 if(ops){const result=await raw.rpc('begin_account_access',{p_actor:ops.user_id,p_user:inviteTarget,p_organisation:fixture.organisationId,p_attempt:crypto.randomUUID(),p_token_hash:'b'.repeat(64)});must(result.error?.code==='42501','owner_approval_not_enforced');evidence.checks.ownerApprovalEnforced=true;}
 const cross=await action(ids,'sendAccountAccess',[setupTarget,crypto.randomUUID()],session.jar);must(cross.success===false,'cross_org_send_allowed');evidence.checks.crossOrganisationDenied=true;
 const cooldown=state.data.memberships[0].retryAt?Date.parse(state.data.memberships[0].retryAt):0;
 if(cooldown>Date.now())console.log(JSON.stringify({phase:'respecting_existing_synthetic_cooldown',seconds:Math.ceil((cooldown-Date.now())/1000)}));
 while(cooldown>Date.now())await new Promise(resolve=>setTimeout(resolve,5000));
 const sent=await action(ids,'sendAccountAccess',[setupTarget,fixture.organisationId],session.jar);must(sent.success,'deployed_setup_send_failed:'+sent.error);const setupLink=await receipt(setupTarget);
 // Only the exact newly-created synthetic Auth record is aged. No project
 // policy, existing account, audit timestamp or membership is modified.
 const age=await db`update auth.users set recovery_sent_at=now()-interval '3601 seconds' where id=${setupTarget} and email=${fixture.emails[setupKey]} returning id`;must(age.length===1,'synthetic_expiry_age_failed');
 await confirm(setupLink,'expired_recovery_link');evidence.checks.expiredSetupLinkRejectedByProductionApp=true;
 const beforeCount=await db`select count(*)::int n from public.platform_audit_record where reason='account_access.attempt' and target_entity_id=${setupTarget}`;
 const concurrent=await Promise.all([action(ids,'sendAccountAccess',[setupTarget,fixture.organisationId],session.jar),action(ids,'sendAccountAccess',[setupTarget,fixture.organisationId],session.jar)]);must(concurrent.every(r=>r.success===false),'cooldown_not_enforced');
 const afterCount=await db`select count(*)::int n from public.platform_audit_record where reason='account_access.attempt' and target_entity_id=${setupTarget}`;must(beforeCount[0].n===afterCount[0].n,'cooldown_created_duplicate_attempt');evidence.checks.concurrentCooldownRequestsDeniedWithoutDuplicateAttempt=true;
 must((await action(ids,'sendAccountAccess',[inviteTarget,fixture.organisationId],session.jar)).success,'deployed_resend_failed');const invitationLink=await receipt(inviteTarget);
 await confirm(invitationLink,'/auth/reset-password');evidence.checks.freshSetupLinkAcceptedByProductionApp=true;
 await confirm(invitationLink,'expired_recovery_link');evidence.checks.singleUseLinkReplayRejected=true;
 const refreshed=await action(ids,'getAccountAccess',[inviteTarget],session.jar);must(refreshed.success&&refreshed.data.memberships[0].deliveryState==='delivered','admin_delivery_state_not_confirmed');
 const audit=await db`select reason,resulting_state from public.platform_audit_record where target_entity_type='account_access' and target_entity_id=any(${[setupTarget,inviteTarget]}) and created_at>=${evidence.startedAt}::timestamptz order by created_at`;
 must(audit.filter(r=>r.reason==='account_access.attempt').length===2,'unexpected_invitation_attempt_count');must(audit.some(r=>r.reason==='account_access.delivery'&&r.resulting_state.deliveryState==='delivered'),'delivery_not_audited');must(!JSON.stringify(audit).includes('token_hash'),'authentication_token_in_audit');evidence.checks.attemptOutcomeAndDeliveryAudited=true;
 const ownAfter=await db`select id,md5(to_jsonb(m)::text) digest from public.organisation_membership m where organisation_id=${fixture.organisationId} order by id`;must(JSON.stringify(ownAfter)===JSON.stringify(ownBefore),'synthetic_memberships_changed');evidence.checks.syntheticMembershipsUnchanged=true;
 const current=await db`select id,md5(to_jsonb(m)::text) digest from public.organisation_membership m where organisation_id<>${fixture.organisationId} order by id`;must(JSON.stringify(current)===JSON.stringify(preexisting),'preexisting_memberships_changed');evidence.checks.preexistingMembershipsUnchanged=true;
 evidence.status='passed';
 }catch(error){evidence.status='failed';evidence.failureCode=error.message?.replace(/https?:\/\/\S+/g,'[redacted]').slice(0,150);process.exitCode=1;}
 finally{
  evidence.cleanup={syntheticAccountsBanned:[]};
  if(rootClient)for(const [name,id] of Object.entries(fixture.accounts)){try{const user=await raw.auth.admin.getUserById(id),expected=fixture.emails[name]??`delivered+movrr-access-${fixture.runId}-${name}@resend.dev`;must(user.data.user?.email===expected,'cleanup_fixture_identity_mismatch');if(name.startsWith('operator')){must(user.data.user.app_metadata?.employee_provisioning_id===id,'cleanup_operator_reservation_mismatch');const role=(await db`select role from public.admin_users where user_id=${id}`)[0]?.role;if(role)await rpc('assign_employee_role',{p_actor:rootActor,p_user:id,p_role:null,p_expected_role:role});evidence.cleanup.syntheticOperatorEmployeeGrantRevoked=true;}else{must(user.data.user.app_metadata?.external_account_provisioning_id===id,'cleanup_target_reservation_mismatch');if(user.data.user.banned_until&&Date.parse(user.data.user.banned_until)>Date.now())evidence.cleanup.syntheticAccountsBanned.push(id);else{const result=await rootClient.auth.admin.updateUserById(id,{ban_duration:'876000h'});if(!result.error)evidence.cleanup.syntheticAccountsBanned.push(id);else evidence.cleanup.failed=true;}}}catch{evidence.cleanup.failed=true;}}
  evidence.completedAt=new Date().toISOString();evidence.fixtureManifest=manifestFile;
  fs.writeFileSync(path.join(out,'production-e2e.json'),JSON.stringify(evidence,null,2)+'\n');
  await db.end();console.log(JSON.stringify(evidence));
 }
})();
