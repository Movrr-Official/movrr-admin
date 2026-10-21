// Anonymous read-only requests. No auth tokens, cookies, invitations or mutations.
const fs=require('node:fs'),assert=require('node:assert/strict');
const file=process.argv[2];assert(file,'Explicit evidence path required');
const api=['/api/v1/me/memberships','/api/v1/organisations','/api/v1/organisations/00000000-0000-0000-0000-000000000001/staff','/api/v1/campaigns','/api/v1/government/programmes','/api/v1/partners/analytics','/api/v1/fulfilment/health'];
(async()=>{const rows=[];for(const [origin,pathname,expected] of [
 ...api.map(p=>['https://admin.movrr.nl',p,401]),
 ['https://admin.movrr.nl','/users',307],['https://admin.movrr.nl','/users/create',307],['https://admin.movrr.nl','/auth/signin',200],
 ['https://app.movrr.nl','/auth/signin',200],['https://app.movrr.nl','/workspaces',307],['https://app.movrr.nl','/',307],
]){const r=await fetch(origin+pathname,{redirect:'manual',signal:AbortSignal.timeout(30000)}),body=await r.text();
 const row={origin,pathname,status:r.status,location:r.headers.get('location'),contentType:r.headers.get('content-type'),vercelId:r.headers.get('x-vercel-id')};rows.push(row);
 if(r.status!==expected){fs.writeFileSync(file,JSON.stringify({rows,failed:row},null,2));assert.equal(r.status,expected,origin+pathname);}
 if(expected===401){assert.match(row.contentType,/json/);assert.equal(row.location,null);assert.match(body,/unauthorized|unauthenticated|authentication|token/i);}
 if(expected===307)assert.equal(new URL(row.location,origin).pathname,'/auth/signin');
 if(expected===200)assert.match(body,/sign in|sign-in|signin/i);
 }const result={recordedAt:new Date().toISOString(),requests:'anonymous GET only',passed:rows.length,rows,authenticatedAcceptance:false};fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:rows.length,authenticatedAcceptance:false}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
