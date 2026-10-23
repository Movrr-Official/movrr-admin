// Real local PostgREST over the candidate PostgreSQL schema; synthetic JWTs only.
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=async({db,owner,organiser,outsider,third,create,review})=>{
 const container='movrr-safety-api-'+process.pid,secret='isolated-community-safety-test-secret-2026';let count=0,base;
 const equal=(a,b)=>{assert.deepEqual(a,b);count++};
 const token=sub=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub,role:'authenticated',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return a+'.'+b+'.'+crypto.createHmac('sha256',secret).update(a+'.'+b).digest('base64url')};
 async function request(user,path,body,method=body===undefined?'GET':'POST'){
  const r=await fetch(base+path,{method,headers:{...(user?{Authorization:'Bearer '+token(user)}:{}),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const text=await r.text();return{status:r.status,data:text?JSON.parse(text):null};
 }
 try{
  execFileSync('docker',['--context','desktop-linux','run','--pull=never','--detach','--name',container,'--publish','127.0.0.1::3000','--env',`PGRST_DB_URI=postgres://postgres:isolated-local-test-only@host.docker.internal:${db.options.port}/${db.options.database}`,'--env','PGRST_DB_ANON_ROLE=anon','--env',`PGRST_JWT_SECRET=${secret}`,'--env','PGRST_DB_SCHEMAS=public','public.ecr.aws/supabase/postgrest:v16.4'],{stdio:'pipe'});
  const endpoint=execFileSync('docker',['--context','desktop-linux','port',container,'3000/tcp'],{encoding:'utf8'}).trim();
  assert.match(endpoint,/^127\.0\.0\.1:\d+$/);base='http://'+endpoint;
  let ready=false;for(let i=0;i<40;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert(ready,'Local API unavailable');
  const ride=await create();
  equal((await request(outsider,`/community_ride?id=eq.${ride.id}&select=id`)).data.length,0);
  equal((await request(outsider,'/rpc/join_community_ride',{p_community_ride_id:ride.id,p_rider_id:third})).status,403);
  await review(ride);
  equal((await request(outsider,`/community_ride?id=eq.${ride.id}&select=id`)).data.length,1);
  equal((await request(outsider,'/rpc/join_community_ride',{p_community_ride_id:ride.id,p_rider_id:third})).data.success,true);
  const report={p_ride:ride.id,p_target:'ride',p_reason:'spam',p_description:'Synthetic non-offensive review fixture'};
  const submitted=await request(outsider,'/rpc/report_community_content',report);equal(submitted.status,200);
  equal((await request(outsider,'/rpc/report_community_content',report)).data,submitted.data);
  equal((await request(null,'/rpc/report_community_content',report)).status,401);
  equal((await request(owner,'/community_report?select=*')).status,403);
  equal((await request(outsider,'/community_report?select=*')).status,403);
  equal((await request(outsider,'/rpc/set_community_block',{p_rider:third,p_blocked:true})).status,400);
  equal((await request(outsider,'/rpc/set_community_block',{p_rider:organiser,p_blocked:true})).status,204);
  equal((await request(outsider,`/community_ride?id=eq.${ride.id}&select=id`)).data.length,1);
  equal((await request(outsider,'/rpc/join_community_ride',{p_community_ride_id:ride.id,p_rider_id:third})).status,403);
  equal((await request(outsider,'/rpc/my_community_blocks',{})).data.length,1);
  equal((await request(owner,'/rpc/my_community_blocks',{})).data.length,0);
  equal((await request(outsider,'/rpc/set_community_block',{p_rider:organiser,p_blocked:false})).status,204);
  equal((await db`SELECT status FROM community_ride_participant WHERE community_ride_id=${ride.id} AND rider_id=${third}`)[0].status,'joined');
  equal((await request(owner,`/community_ride?id=eq.${ride.id}`,{title:'Edited through the direct API'},'PATCH')).status,200);
  equal((await request(outsider,`/community_ride?id=eq.${ride.id}&select=id`)).data.length,0);
  equal((await request(owner,`/community_ride?id=eq.${ride.id}`,{moderation_state:'approved'},'PATCH')).status,403);
  const denied=await request(outsider,'/rpc/moderate_community_content',{p_operation:crypto.randomUUID(),p_actor:outsider,p_ride:ride.id,p_version:1,p_action:'approve',p_reason:'Unauthorised review'});
  equal(denied.status,403);
  return count;
 }finally{execFileSync('docker',['--context','desktop-linux','rm','-f',container],{stdio:'pipe'})}
};
