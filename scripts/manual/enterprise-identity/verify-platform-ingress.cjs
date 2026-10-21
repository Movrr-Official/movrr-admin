// Read-only GETs and unauthorised invitation POSTs; never supply real credentials.
// Usage: node scripts/manual/enterprise-identity/verify-platform-ingress.cjs https://admin.movrr.nl .tmp/<task>/http.json
// The output directory must already exist. --baseline records without asserting corrected responses.
const fs=require('node:fs'), assert=require('node:assert/strict');
const base=process.argv[2], output=process.argv[3];
assert(base && output);
const routes=['/api/v1/me/memberships','/api/v1/organisations','/api/v1/organisations/00000000-0000-0000-0000-000000000001','/api/v1/organisations/00000000-0000-0000-0000-000000000001/staff','/api/v1/organisations/00000000-0000-0000-0000-000000000001/invitations','/api/v1/organisations/00000000-0000-0000-0000-000000000001/locations','/api/v1/campaigns','/api/v1/government/programmes','/api/v1/partners/analytics','/api/v1/fulfilment/health','/api/v1/fulfilment/exceptions'];
(async()=>{
const results=[];
for(const auth of ['none','invalid']) for(const route of routes){
 const method=route.endsWith('/invitations')?'POST':'GET';
 const headers=auth==='invalid'?{authorization:'Bearer id25-invalid-token'}:{};
 if(method==='POST')headers['content-type']='application/json';
 const r=await fetch(base+route,{method,headers,...(method==='POST'?{body:'{}'}:{}),redirect:'manual',signal:AbortSignal.timeout(30000)});
 const body=await r.text();results.push({route,method,authentication:auth,status:r.status,location:r.headers.get('location'),contentType:r.headers.get('content-type'),cacheControl:r.headers.get('cache-control'),vercelId:r.headers.get('x-vercel-id'),body:body.slice(0,500)});
}
for(const route of ['/users','/settings','/api/users','/api/v1/organisations/id/staff/unsafe','/auth/signin']){
 const r=await fetch(base+route,{redirect:'manual',signal:AbortSignal.timeout(30000)});results.push({route,authentication:'none',status:r.status,location:r.headers.get('location'),contentType:r.headers.get('content-type'),vercelId:r.headers.get('x-vercel-id')});
}
const report={at:new Date().toISOString(),base,requests:'GET plus missing/invalid-token POST {} to POST-only invitations; no valid credentials or identity mutations',results};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--baseline')) { console.log(JSON.stringify({at:report.at,base,results:results.map(({route,authentication,status,location})=>({route,authentication,status,location}))}));return; }
for(const r of results){if(routes.includes(r.route)){assert.equal(r.status,401,r.route);assert.match(r.contentType,/json/);assert.equal(r.location,null);}else if(r.route==='/auth/signin')assert.equal(r.status,200);else {assert.equal(r.status,307,r.route);assert.equal(new URL(r.location,base).pathname,'/auth/signin');}}
console.log(JSON.stringify({at:report.at,base,passed:results.length,canonicalApiDenials:routes.length*2,adminCookieGates:4,signinAvailable:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
