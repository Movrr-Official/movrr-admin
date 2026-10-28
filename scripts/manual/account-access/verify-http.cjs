// Read-only production smoke checks. Anonymous RPC probes must be denied.
const fs=require('node:fs'),assert=require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
(async()=>{
 const checks=[];
 for(const path of ['/auth/signin','/users']){
  const response=await fetch('https://admin.movrr.nl'+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  checks.push({path,status:response.status,location:response.headers.get('location')});
  if(path==='/auth/signin')assert.equal(response.status,200);
  else{assert([302,303,307,308].includes(response.status));assert(response.headers.get('location')?.includes('/auth/signin'));}
 }
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 assert.equal(new URL(url).hostname,'kzdvunpuxaxlphqvmzxw.supabase.co');
 const synthetic='00000000-0000-4000-8000-000000000087';
 for(const [name,args] of Object.entries({account_access_state:{p_actor:synthetic,p_user:synthetic},begin_account_access:{p_actor:synthetic,p_user:synthetic,p_organisation:synthetic,p_attempt:synthetic,p_token_hash:'a'.repeat(64)}})){
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:`Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
  assert([401,403].includes(response.status),'Anonymous recovery RPC accessible');
  checks.push({rpc:name,anonymousStatus:response.status});
 }
 const result={checkedAt:new Date().toISOString(),checks,liveSetupLinksSent:0};
 fs.writeFileSync('docs/verification/account-access-20261028/http-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.code||e.name,e.message);process.exitCode=1});
