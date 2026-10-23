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
  return {stop,seedExisting:async({owner,ride,as})=>{
   const path=`${owner}/${ride.id}/cover.png`;
   equal((await request(owner,'/object/community-rides/'+path,'POST',image)).status,200);
   const publicUrl=base+'/object/public/community-rides/'+path;
   equal((await fetch(publicUrl)).status,200);
   await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${path},cover_image_url=${publicUrl} WHERE id=${ride.id}`);
   return {path,publicUrl};
  },verifyExisting:async({viewer,fixture})=>{
   denied(await fetch(fixture.publicUrl));
   const signed=await request(viewer,'/object/sign/community-rides/'+fixture.path,'POST',{expiresIn:60});equal(signed.status,200);
   const bytes=await fetch(base+(await signed.json()).signedURL);equal(bytes.status,200);equal(Buffer.from(await bytes.arrayBuffer()),image);
  },run:async({owner,outsider,create,review,report,as})=>{
   const c=await create(),path=`${owner}/${c.id}/${crypto.randomUUID()}.png`,url='/object/community-rides/'+path;
   const uploaded=await request(owner,url,'POST',image);equal(uploaded.status,200);
   await as(owner,tx=>tx`UPDATE community_ride SET cover_image_path=${path} WHERE id=${c.id}`);
   denied(await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(null,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(outsider,'/object/authenticated/community-rides/'+path));
   denied(await request(null,'/object/public/community-rides/'+path));
   const ownSign=await request(owner,'/object/sign/community-rides/'+path,'POST',{expiresIn:60});equal(ownSign.status,200);
   const ownUrl=(await ownSign.json()).signedURL;equal((await fetch(base+ownUrl)).status,200);
   const current=(await db`SELECT * FROM community_ride WHERE id=${c.id}`)[0];await review(current);
   const signed=await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60});equal(signed.status,200);const signedUrl=(await signed.json()).signedURL;
   const bytes=await fetch(base+signedUrl);equal(bytes.status,200);equal(Buffer.from(await bytes.arrayBuffer()),image);
   const short=await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:1});equal(short.status,200);const shortUrl=(await short.json()).signedURL;
   await new Promise(resolve=>setTimeout(resolve,2100));denied(await fetch(base+shortUrl));
   denied(await request(owner,url,'PUT',image));
   await report(current,'image',outsider);
   await review((await db`SELECT * FROM community_ride WHERE id=${c.id}`)[0],'restrict');
   denied(await request(outsider,'/object/sign/community-rides/'+path,'POST',{expiresIn:60}));
   denied(await request(outsider,'/object/authenticated/community-rides/'+path));
   denied(await request(null,'/object/public/community-rides/'+path));
   // A previously issued bearer URL survives until expiry, never immediate recall.
   equal((await fetch(base+signedUrl)).status,200);
   denied(await request(owner,'/object/community-rides','DELETE',{prefixes:[path]}));
   equal((await db`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='community-rides' AND name=${path}`)[0].n,1);
   const orphan=`${owner}/${c.id}/${crypto.randomUUID()}.png`;equal((await request(owner,'/object/community-rides/'+orphan,'POST',image)).status,200);
   equal((await request(owner,'/object/community-rides','DELETE',{prefixes:[orphan]})).status,200);
   equal((await db`SELECT count(*)::int n FROM storage.objects WHERE bucket_id='community-rides' AND name=${orphan}`)[0].n,0);
   console.log(JSON.stringify({storageAssertions:count,storageApi:'1.79.36',actualByteTransfer:true,productionMutations:false}));return count;
  }};
 }catch(e){try{stop()}catch{}throw e;}
};
