// Execute the actual Next handler/pipeline/application source against real
// PostgREST JWT verification, RLS and Storage bytes. Auth/connection ports point
// only to the disposable fixture; no production Auth service is represented.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const ts=require('typescript'),{createClient}=require('@supabase/supabase-js');
module.exports=async({db,base,token,owner,outsider,organiser,third,create,review,storage})=>{
 let n=0,onDownload,staff=false,staffChecks=0;const equal=(a,b)=>{assert.deepEqual(a,b);n++};
 const serviceToken=storage.token(owner,'service_role');
 const server=http.createServer(async(req,res)=>{
  const target=req.url.startsWith('/rest/v1/')?base+req.url.slice('/rest/v1'.length):storage.base+req.url.slice('/storage/v1'.length);
  // The two isolated services deliberately use different signing secrets. Map
  // only this exact server credential to its PostgREST equivalent; rider tokens
  // always reach the real verifier untouched.
  const authorization=req.url.startsWith('/rest/v1/')&&req.headers.authorization==='Bearer '+serviceToken?'Bearer '+token(owner,undefined,'service_role'):req.headers.authorization??'';
  try{if(req.url.startsWith('/storage/v1/object/')&&onDownload){const pending=onDownload;onDownload=undefined;await pending();}const response=await fetch(target,{headers:{authorization,apikey:'isolated'},signal:AbortSignal.timeout(10000)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(503);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const client=bearer=>createClient(url,'isolated-test-key',{global:{headers:{Authorization:'Bearer '+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const privileged=client(serviceToken);
 const deps={
  verifyAccessToken:async bearer=>{
   // PostgREST checks the actual signature, expiry and canonical account RPC.
   const response=await fetch(base+'/rpc/my_community_blocks',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:'{}'});
   if(!response.ok)return null;
   return {userId:JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).sub,email:null};
  },
  findRiderProfile:async user=>{const r=(await db`SELECT id,user_id FROM rider WHERE user_id=${user} AND status='active'`)[0];return r?{id:r.id,userId:r.user_id}:null;},
  findAdminUser:async()=>null,findOrganisationMembership:async()=>null,
 };
 const overrides={
  '@/features/platform/infrastructure/productionPlatformApi':{productionAuthDeps:deps},
  '@/lib/supabase-request':{createSupabaseRequestClient:request=>client(request.headers.get('authorization').slice(7))},
  '@/lib/supabase-admin':{createSupabaseAdminClient:()=>privileged},
  '@/lib/admin':{requireCapability:async capability=>{staffChecks++;assert.equal(capability,'community.manage');if(!staff)throw Error('No synthetic dashboard cookie session');}},
 };
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{}};cache.set(file,mod.exports);
  const runtimeRequire=id=>{
   if(id==='server-only')return {};
   if(overrides[id])return overrides[id];
   if(id.startsWith('@/'))return load(path.resolve(__dirname,'..',id.slice(2)+'.ts'));
   if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
   return require(id);
  };
  new Function('require','module','exports',source)(runtimeRequire,mod,mod.exports);cache.set(file,mod.exports);return mod.exports;
 }
 try{
  const handler=load(path.resolve(__dirname,'../app/api/v1/community-rides/[id]/cover/route.ts'));
  const read=(user,ride,query='',bearer=user?token(user):null)=>handler.GET(new Request('http://isolated.invalid/api/v1/community-rides/'+ride+'/cover'+query,{headers:bearer?{Authorization:'Bearer '+bearer}:{}}),{params:Promise.resolve({id:ride})});
  const ride=await create(),imagePath=owner+'/'+ride.id+'/secure-media.png';
  equal((await storage.request(owner,'/object/community-rides/'+imagePath,'POST',storage.image)).status,200);
  await db.begin(async tx=>{await tx`SELECT set_config('request.jwt.claim.role','service_role',true)`;await tx`UPDATE community_ride SET cover_image_path=${imagePath} WHERE id=${ride.id}`;});
  equal((await read(outsider,ride.id)).status,404);
  const preview=await read(owner,ride.id);equal(preview.status,200);equal(Buffer.from(await preview.arrayBuffer()),storage.image);
  equal(preview.headers.get('cache-control'),'private, no-store, max-age=0');equal(preview.headers.get('vercel-cdn-cache-control'),'no-store');equal(preview.headers.get('location'),null);
  equal((await read(null,ride.id)).status,403);
  staff=true;
  equal((await read(null,ride.id)).status,200); // Authenticated staff review port.
  const checksBefore=staffChecks;
  equal((await handler.GET(new Request('http://isolated.invalid/api/v1/community-rides/'+ride.id+'/cover',{headers:{Authorization:'Basic malformed'}}),{params:Promise.resolve({id:ride.id})})).status,401);
  equal(staffChecks,checksBefore); // Never fall back to cookies on bearer failure.
  staff=false;
  equal((await read(outsider,ride.id,'',token(outsider)+'bad')).status,401);
  equal((await read(outsider,ride.id,'',token(outsider,Math.floor(Date.now()/1000)-300))).status,401);
  equal((await read(outsider,ride.id,'?report='+ride.id)).status,403);
  equal((await read(outsider,ride.id,'?staged='+encodeURIComponent(imagePath))).status,403);
  await review((await db`SELECT * FROM community_ride WHERE id=${ride.id}`)[0]);
  const allowed=await read(outsider,ride.id);equal(allowed.status,200);equal(Buffer.from(await allowed.arrayBuffer()),storage.image);
  const reportId=await db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${outsider},true),set_config('request.jwt.claim.role','authenticated',true)`;return (await tx`SELECT report_community_content(${ride.id},'image','other','Synthetic private evidence') id`)[0].id;});
  staff=true;
  const evidence=await read(null,ride.id,'?report='+reportId);equal(evidence.status,200);equal(Buffer.from(await evidence.arrayBuffer()),storage.image);
  equal((await read(null,ride.id,'?report='+ride.id)).status,404);
  staff=false;
  onDownload=async()=>review((await db`SELECT * FROM community_ride WHERE id=${ride.id}`)[0],'restrict');
  equal((await read(outsider,ride.id)).status,403); // Publication changed in flight.
  await review((await db`SELECT * FROM community_ride WHERE id=${ride.id}`)[0]);
  await db`UPDATE rider SET status='inactive' WHERE user_id=${outsider}`;
  equal((await read(outsider,ride.id)).status,401);
  await db`UPDATE rider SET status='active' WHERE user_id=${outsider}`;
  // Existing shared-ride authorisation survives blocking.
  await db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${outsider},true),set_config('request.jwt.claim.role','authenticated',true)`;await tx`SELECT join_community_ride(${ride.id},${third})`;await tx`SELECT set_community_block(${organiser},true)`;});
  equal((await read(outsider,ride.id)).status,200);
  await review((await db`SELECT * FROM community_ride WHERE id=${ride.id}`)[0],'restrict');
  const denied=await read(outsider,ride.id);equal(denied.status,404);equal(denied.headers.get('cache-control'),'private, no-store, max-age=0');
  equal((await read(owner,ride.id)).status,200); // Organiser's authorised preview.
  await db.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${outsider},true),set_config('request.jwt.claim.role','authenticated',true)`;await tx`SELECT set_community_block(${organiser},false)`;});
  return n;
 }finally{await new Promise(resolve=>server.close(resolve));}
};
