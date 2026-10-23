// Real Supabase Storage API, local-only file backend and synthetic JWTs/bytes.
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
module.exports=async function startStorage(db){
 const container='movrr-safety-storage-'+process.pid,secret='isolated-community-storage-test-secret-2026';let count=0,base;
 const docker=(args)=>execFileSync('docker',['--context','desktop-linux',...args],{stdio:'pipe'});
 const stop=()=>docker(['rm','-f',container]);
 const token=(sub,role='authenticated')=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub,role,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return a+'.'+b+'.'+crypto.createHmac('sha256',secret).update(a+'.'+b).digest('base64url')};
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHJkAAAAASUVORK5CYII=','base64');
 const equal=(a,b)=>{assert.deepEqual(a,b);count++},denied=r=>{assert(r.status>=400,'Unexpected Storage grant '+r.status);count++};
 async function request(user,url,method='GET',body,role='authenticated') {return fetch(base+url,{method,headers:{...(user?{Authorization:'Bearer '+token(user,role)}:{}),...(body?{'Content-Type':Buffer.isBuffer(body)?'image/png':'application/json'}:{})},body:body?(Buffer.isBuffer(body)?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(10000)});}
 try{
  docker(['run','--pull=never','--detach','--name',container,'--publish','127.0.0.1::5000',
   '--env',`DATABASE_URL=postgres://postgres:isolated-local-test-only@host.docker.internal:${db.options.port}/${db.options.database}`,
   '--env',`AUTH_JWT_SECRET=${secret}`,'--env','DB_INSTALL_ROLES=true','--env','STORAGE_BACKEND=file','--env','FILE_STORAGE_BACKEND_PATH=/var/lib/storage','--env','FILE_SIZE_LIMIT=5242880','--env','REGION=local','--env','GLOBAL_S3_BUCKET=local','--env','TENANT_ID=isolated-audit','public.ecr.aws/supabase/storage-api:v1.79.36']);
  base='http://'+docker(['port',container,'5000/tcp']).toString().trim();
  let ready=false;for(let i=0;i<40;i++){try{if((await fetch(base+'/status',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
  if(!ready)throw Error('Local Storage startup failed: '+docker(['logs','--tail','15',container]).toString());
  return {stop,base,token,image,request,seedExisting:async({owner,ride,as})=>{
   const path=`${owner}/${ride.id}/cover.png`;
   equal((await request(owner,'/object/community-rides/'+path,'POST',image)).status,200);
   const publicUrl=base+'/object/public/community-rides/'+path;
   equal((await fetch(publicUrl)).status,200);
   await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${path},cover_image_url=${publicUrl} WHERE id=${ride.id}`);
   return {path,publicUrl};
  },verifyExisting:async({viewer,fixture})=>{
   denied(await fetch(fixture.publicUrl));
   denied(await request(viewer,'/object/sign/community-rides/'+fixture.path,'POST',{expiresIn:60}));
   const bytes=await request(viewer,'/object/authenticated/community-rides/'+fixture.path,'GET',undefined,'service_role');equal(bytes.status,200);equal(Buffer.from(await bytes.arrayBuffer()),image);
  },run:async({owner,outsider,create,review,report,as})=>{
   const c=await create(),path=`${owner}/${c.id}/${crypto.randomUUID()}.png`,url='/object/community-rides/'+path;
   const uploaded=await request(owner,url,'POST',image);equal(uploaded.status,200);
   await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${path} WHERE id=${c.id}`);
   denied(await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(null,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(outsider,'/object/authenticated/community-rides/'+path));
   denied(await request(null,'/object/public/community-rides/'+path));
   denied(await request(owner,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   const current=(await db`SELECT * FROM community_ride WHERE id=${c.id}`)[0];await review(current);
   denied(await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(outsider,'/object/authenticated/community-rides/'+path));
   const bytes=await request(owner,'/object/authenticated/community-rides/'+path,'GET',undefined,'service_role');equal(bytes.status,200);equal(Buffer.from(await bytes.arrayBuffer()),image);
   denied(await request(owner,url,'PUT',image));
   await report(current,'image',outsider);
   await review((await db`SELECT * FROM community_ride WHERE id=${c.id}`)[0],'restrict');
   denied(await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(outsider,'/object/authenticated/community-rides/'+path));
   denied(await request(null,'/object/public/community-rides/'+path));
   // No new bearer image URLs can be minted by either approved viewer or owner.
   // With SELECT denied, Storage may return idempotent 200 with no visible
   // objects. Assert the real retained bytes/metadata, not a guessed HTTP code.
   await request(owner,'/object/community-rides','DELETE',{prefixes:[path]});
   equal((await db`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='community-rides' AND name=${path}`)[0].n,1);
   const orphan=`${owner}/${c.id}/${crypto.randomUUID()}.png`;equal((await request(owner,'/object/community-rides/'+orphan,'POST',image)).status,200);
   equal((await request(owner,'/object/community-rides','DELETE',{prefixes:[orphan]})).status,200);
   equal((await db`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='community-rides' AND name=${orphan}`)[0].n,1);
   equal((await request(owner,'/object/community-rides','DELETE',{prefixes:[orphan]},'service_role')).status,200);
   equal((await db`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='community-rides' AND name=${orphan}`)[0].n,0);
   // Actual byte disposal: approved synthetic policy, late hold, failed cleanup,
   // durable lease retry and confirmation. No production policy is created.
   const disposable=await create(), disposalPath=`${owner}/${disposable.id}/${crypto.randomUUID()}.png`;
   equal((await request(owner,'/object/community-rides/'+disposalPath,'POST',image)).status,200);
   await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${disposalPath} WHERE id=${disposable.id}`);
   await review((await db`SELECT * FROM community_ride WHERE id=${disposable.id}`)[0]);
   const reportId=await report(disposable,'image',outsider), reportRow=(await db`SELECT * FROM community_report WHERE id=${reportId}`)[0];
   await review((await db`SELECT * FROM community_ride WHERE id=${disposable.id}`)[0],'dismiss',reportRow);
   const caseCommand=async(action,hold=null)=>{
    const version=(await db`SELECT version FROM community_safety_case WHERE id=${reportId}`)[0].version;
    return as(null,tx=>tx`SELECT command_community_safety_case(${crypto.randomUUID()},${owner},${reportId},${version},${action},'Synthetic byte lifecycle check',${hold},${action==='hold'?'Synthetic isolated authority':null},${action==='hold'?new Date(Date.now()+86400000):null})`,'service_role');
   };
   await caseCommand('close');
   await db`DELETE FROM community_ride_participant WHERE community_ride_id=${disposable.id}`;await db`DELETE FROM community_ride WHERE id=${disposable.id}`;
   // The standalone publication decision is a separate evidence reference.
   for(const other of await db`SELECT id,version FROM community_safety_case WHERE ride_id=${disposable.id} AND report_id IS NULL`) {
    await as(null,tx=>tx`SELECT command_community_safety_case(${crypto.randomUUID()},${owner},${other.id},${other.version},'close','Synthetic publication case closure')`,'service_role');
   }
   await db.unsafe('ALTER TABLE community_report DISABLE TRIGGER community_report_clock');
   await db`UPDATE community_report SET resolved_at=clock_timestamp()-interval '13 months' WHERE id=${reportId}`;
   await db.unsafe('ALTER TABLE community_report ENABLE TRIGGER community_report_clock');
   const disposalOperation=crypto.randomUUID();
   await as(null,tx=>tx`SELECT dispose_community_safety(${disposalOperation},${reportId},900001)`,'service_role');
   const claim=()=>as(null,tx=>tx`SELECT claim_community_cover_disposal(${disposalOperation}) path`,'service_role');
   equal((await claim()).map(x=>x.path),[disposalPath]);equal((await claim()).length,0);
   const hold=crypto.randomUUID();await caseCommand('hold',hold);
   denied(await request(owner,'/object/community-rides','DELETE',{prefixes:[disposalPath]},'service_role'));
   equal((await request(owner,'/object/authenticated/community-rides/'+disposalPath,'GET',undefined,'service_role')).status,200);
   await caseCommand('release',hold);
   await db`UPDATE community_cover_disposal SET lease_until=clock_timestamp()-interval '1 second' WHERE path=${disposalPath}`;
   equal((await claim()).length,1);
   equal((await request(owner,'/object/community-rides','DELETE',{prefixes:[disposalPath]},'service_role')).status,200);
   await as(null,tx=>tx`SELECT confirm_community_cover_disposal(${disposalOperation},${disposalPath})`,'service_role');
   denied(await request(owner,'/object/authenticated/community-rides/'+disposalPath,'GET',undefined,'service_role'));
   equal((await as(null,tx=>tx`SELECT community_safety_disposal_status(${disposalOperation}) data`,'service_role'))[0].data.remaining,0);
   console.log(JSON.stringify({storageAssertions:count,storageApi:'1.79.36',actualByteTransfer:true,productionMutations:false}));return count;
  }};
 }catch(e){try{stop()}catch{}throw e;}
};
