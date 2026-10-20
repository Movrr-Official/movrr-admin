// Isolated PostgREST + PostgreSQL integration; no remote environment files.
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=async({db,approved,rider,other,otherRider})=>{
 const container='movrr-community-api-'+process.pid,base='http://127.0.0.1:55440',secret='isolated-community-authorization-jwt-secret-2026';let count=0;
 const equal=(a,b)=>{assert.deepEqual(a,b);count++};
 const token=sub=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub,role:'authenticated',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return a+'.'+b+'.'+crypto.createHmac('sha256',secret).update(a+'.'+b).digest('base64url')};
 const request=async(user,path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token(user),'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return{status:r.status,data:await r.json()}};
 try{
  execFileSync('docker',['--context','desktop-linux','run','--pull=never','--detach','--name',container,'--publish','127.0.0.1:55440:3000','--env',`PGRST_DB_URI=postgres://postgres:isolated-local-test-only@host.docker.internal:55439/${db.options.database}`,'--env','PGRST_DB_ANON_ROLE=anon','--env',`PGRST_JWT_SECRET=${secret}`,'--env','PGRST_DB_SCHEMAS=public','public.ecr.aws/supabase/postgrest:v16.4'],{stdio:'pipe'});
  let ready=false;for(let i=0;i<40;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert(ready,'Local PostgREST did not become ready');
  await db`UPDATE community_ride_creator_grant SET revoked_at=NULL WHERE user_id=${approved}`;
  const row={title:'HTTP direct Mobile contract',organizer_type:'rider',organizer_user_id:approved,created_by_user_id:approved,organizer_rider_id:rider,organizer_name:'Fixture',scheduled_at:'2099-01-01T12:00:00Z',category:'social',max_participants:20,status:'upcoming',is_public:true};
  const created=await request(approved,'/community_ride',row);equal(created.status,201);equal(created.data[0].organizer_rider_id,rider);
  const rpcBody={p_operation:crypto.randomUUID(),p_input:{title:'HTTP RPC contract',scheduledAt:'2099-01-01T12:00:00Z',category:'social',maxParticipants:20}};
  equal((await request(approved,'/rpc/create_my_community_ride',rpcBody)).status,200);
  equal((await request(other,'/community_ride',{...row,organizer_user_id:other,created_by_user_id:other,organizer_rider_id:otherRider})).status,403);
  equal((await request(other,'/rpc/create_my_community_ride',{...rpcBody,p_operation:crypto.randomUUID()})).status,403);
  equal((await request(approved,'/community_ride',{...row,organizer_rider_id:otherRider})).status,403);
  await db`UPDATE rider SET status='suspended' WHERE id=${rider}`;
  equal((await request(approved,'/community_ride',row)).status,403);
  equal((await request(approved,'/rpc/create_my_community_ride',{...rpcBody,p_operation:crypto.randomUUID()})).status,403);
  await db`UPDATE rider SET status='active' WHERE id=${rider}`;
  await db`UPDATE community_ride_creator_grant SET revoked_at=now() WHERE user_id=${approved}`;
  equal((await request(approved,'/rpc/create_my_community_ride',rpcBody)).status,403);
  return count;
 }finally{execFileSync('docker',['--context','desktop-linux','rm','-f',container],{stdio:'pipe'})}
};
