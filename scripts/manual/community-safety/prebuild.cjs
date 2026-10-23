// Production READ ONLY: reference mapping and current public CDN baseline.
// Never uploads, signs, changes access, invokes mutations, or purges an object.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),project='kzdvunpuxaxlphqvmzxw';
const out=path.resolve(repo,process.env.MOVRR_COMMUNITY_PREFLIGHT_DIR||'.tmp/community-safety-prebuild-20261023');
assert(out.startsWith(path.join(repo,'.tmp')+path.sep),'Evidence must stay in ignored storage');fs.mkdirSync(out,{recursive:true});
const env=Object.fromEntries(fs.readFileSync(path.join(repo,'.env'),'utf8').split(/\r?\n/).flatMap(l=>{const m=l.match(/^([A-Z_0-9]+)=(.*)$/);return m?[[m[1],m[2].replace(/^['"]|['"]$/g,'')]]:[]}));
const dbUrl=new URL(env.DATABASE_URL),api=new URL(env.NEXT_PUBLIC_SUPABASE_URL);
assert(dbUrl.username.endsWith('.'+project));assert.equal(api.hostname,project+'.supabase.co');
const db=postgres(env.DATABASE_URL,{ssl:'require',max:1,connect_timeout:20,onnotice(){},connection:{application_name:'movrr-safety-prebuild-read-only',default_transaction_read_only:'on',statement_timeout:'30000'}});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const responseHeaders=r=>Object.fromEntries(['cache-control','age','cf-cache-status','x-cache','etag','last-modified','content-type','content-length','vary'].flatMap(k=>r.headers.has(k)?[[k,r.headers.get(k)]]:[]));
const allowedUrl=url=>{const u=new URL(url);assert.equal(u.origin,api.origin);assert(u.pathname.startsWith('/storage/v1/object/public/community-rides/')||u.pathname.startsWith('/storage/v1/render/image/public/community-rides/'));return u;};
async function probe(url){
 const u=allowedUrl(url),r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000)});
 const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.length<=5*1024*1024,'Cover exceeds private-reader byte limit');
 return {status:r.status,headers:responseHeaders(r),bytes:bytes.length,sha256:r.ok?hash(bytes):null};
}
async function inventory(tx){return {
 rides:await tx`SELECT id,organizer_user_id,is_public,status,cover_image_path,cover_image_url FROM public.community_ride ORDER BY id`,
 objects:await tx`SELECT id,name,updated_at,metadata FROM storage.objects WHERE bucket_id='community-rides' ORDER BY name`,
 participantDigest:(await tx`SELECT count(*)::int records,md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY md5(to_jsonb(p)::text)),'')) digest FROM public.community_ride_participant p`)[0],
 bucket:(await tx`SELECT id,public FROM storage.buckets WHERE id='community-rides'`)[0],
 safety:(await tx`SELECT to_regclass('public.community_report')::text reports,to_regclass('public.community_block')::text blocks`)[0]
};}
(async()=>{
 const before=await db.begin('isolation level repeatable read read only',inventory);
 assert.equal(before.safety.reports,null,'Unexpected deployed Safety schema; do not assume previous preflight still applies');
 assert.equal(before.safety.blocks,null);assert.equal(before.bucket.public,true,'Unexpected private cutover');
 const operationFile=path.join(out,'object-reference-manifest.json');
 // Reuse proposed immutable destinations on retry; no destination is uploaded.
 const previous=fs.existsSync(operationFile)?JSON.parse(fs.readFileSync(operationFile,'utf8')):null;
 const operation=previous?.operation||crypto.randomUUID(),mappings=[];
 for(const ride of before.rides){
  if(!ride.cover_image_path&&!ride.cover_image_url)continue;
  const object=before.objects.find(o=>o.name===ride.cover_image_path);
  assert(object,'Cover path has no Storage object');
  assert(ride.is_public,'Non-public cover in current public bucket needs restricted review; do not download it');
  assert(ride.cover_image_url,'Current installed contract has no cover URL');
  const url=allowedUrl(ride.cover_image_url);
  assert.equal(decodeURIComponent(url.pathname),'/storage/v1/object/public/community-rides/'+ride.cover_image_path,'URL/path authority mismatch');
  const coldCandidate=await probe(url),warm=await probe(url);
  assert.equal(coldCandidate.status,200);assert.equal(warm.status,200);assert.equal(coldCandidate.sha256,warm.sha256,'Object changed during byte verification');
  assert(['image/jpeg','image/png','image/webp'].includes((warm.headers['content-type']||'').split(';')[0]),'Incompatible private-reader image MIME type');
  const transformed=new URL('/storage/v1/render/image/public/community-rides/'+ride.cover_image_path,api);transformed.searchParams.set('width','320');transformed.searchParams.set('resize','cover');
  const variant=await probe(transformed);
  const ext=warm.headers['content-type'].includes('png')?'png':warm.headers['content-type'].includes('webp')?'webp':'jpg';
  const existing=previous?.mappings?.find(m=>m.rideId===ride.id&&m.oldPath===ride.cover_image_path&&m.sha256===warm.sha256);
  mappings.push({rideId:ride.id,oldPath:ride.cover_image_path,oldPublicUrl:url.href,objectId:object.id,objectUpdatedAt:object.updated_at,sha256:warm.sha256,bytes:warm.bytes,mime:warm.headers['content-type'],currentPublication:{isPublic:ride.is_public,status:ride.status},
   proposedPrivatePath:existing?.proposedPrivatePath||`${ride.organizer_user_id}/${ride.id}/${crypto.randomUUID()}.${ext}`,
   sourceReferences:{liveRideIds:before.rides.filter(r=>r.cover_image_path===ride.cover_image_path).map(r=>r.id),safetyEvidenceTablesAbsent:true},
   recovery:{originalOriginRetained:true,privateCopyStaged:false,privateCopyHashVerified:false,databaseBackupDoesNotIncludeObjectBytes:true},
   probes:{firstRequest:coldCandidate,repeatRequest:warm,transformed:{url:transformed.href,...variant}},
   retirementRequirements:['stage and hash-verify private originals before reference changes','refresh evidence/hold and live references immediately before cutover','preserve publication, ride IDs and participation through canonical guarded transition','retire old origin through Storage API only after references/recovery are safe','verify warmed public/transformed and previously signed URL denial after provider propagation; never rely only on token expiry']});
 }
 const after=await db.begin('isolation level repeatable read read only',inventory);
 const unchanged=hash(JSON.stringify(before))===hash(JSON.stringify(after));
 const manifest={capturedAt:new Date().toISOString(),project,operation,mode:'read-only preparation; not an apply/erase approval',mappings,
  unreferencedObjectPaths:before.objects.filter(o=>!before.rides.some(r=>r.cover_image_path===o.name)).map(o=>o.name),
  snapshotUnchanged:unchanged,participantDigest:before.participantDigest,objectsTotal:before.objects.length,
  signedUrlTokensCreated:false,storageOrDatabaseWrites:false,privateRecoveryVerified:false,cdnRevocationVerified:false,
  coldEdgeClaim:'First request is an observed edge response, not proof of a globally cold CDN',
  subsequentCutover:'No object deletion, cache purge or privacy flip is allowed by this preparation tool'};
 fs.writeFileSync(operationFile,JSON.stringify(manifest,null,2)+'\n');
 const riderAccounts=await db.begin('read only',tx=>tx`SELECT DISTINCT r.user_id FROM public.rider r JOIN public.community_ride c ON c.organizer_user_id=r.user_id WHERE c.is_public AND public.community_rider_account_active(r.user_id)`);
 const riderRoleReads=[];
 for(const account of riderAccounts)riderRoleReads.push(await db.begin('read only',async tx=>{
  await tx.unsafe('SET LOCAL ROLE authenticated');
  await tx`SELECT set_config('request.jwt.claim.sub',${account.user_id},true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',${JSON.stringify({sub:account.user_id,role:'authenticated'})},true)`;
  const visible=(await tx`SELECT count(*)::int n FROM public.community_ride WHERE is_public`)[0].n;
  return {role:(await tx`SELECT current_user name`)[0].name,visiblePublicRides:visible};
 }));
 const staffCapabilities=await db.begin('read only',tx=>tx`SELECT role,public.ops_employee_capabilities(role)?'community.manage' moderation,public.ops_employee_capabilities(role)?'privacy.deletion.compliance.review' privacy FROM unnest(ARRAY['super_admin','trust_safety_analyst','support_agent']) role`);
 const headers={apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
 const publicRides=await fetch(new URL('/rest/v1/community_ride?select=id&is_public=eq.true',api),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 const publicResult=await publicRides.json();
 const blocks=await fetch(new URL('/rest/v1/rpc/my_community_blocks',api),{headers,redirect:'error',signal:AbortSignal.timeout(15000)});const blockResult=await blocks.json();
 const admin=await fetch('https://admin.movrr.nl/community-rides',{redirect:'manual',signal:AbortSignal.timeout(15000)});
 const media=await fetch('https://admin.movrr.nl/api/v1/community-rides/'+before.rides[0].id+'/cover',{redirect:'manual',signal:AbortSignal.timeout(15000)});
 const summary={capturedAt:manifest.capturedAt,project,productionMutations:false,publicRides:before.rides.filter(r=>r.is_public).length,mappedCovers:mappings.length,storageObjects:before.objects.length,unreferencedObjects:manifest.unreferencedObjectPaths.length,
  originalsByteVerified:mappings.length,publicationAndParticipationSnapshotUnchanged:unchanged,participantCount:before.participantDigest.records,
  publicDiscovery:{status:publicRides.status,rows:Array.isArray(publicResult)?publicResult.length:null,code:publicResult.code??null},blockedRiders:{status:blocks.status,code:blockResult.code??null},
  authenticatedRoleSqlReads:{accountsChecked:riderRoleReads.length,results:riderRoleReads,realJwtHttpSession:false},staffCapabilityMapping:staffCapabilities,
  anonymousAdmin:{status:admin.status,redirectPath:admin.headers.get('location')?new URL(admin.headers.get('location'),admin.url).pathname:null},
  undeployedMediaEndpoint:{status:media.status,cacheControl:media.headers.get('cache-control')},
  currentPublicCdn:mappings.map(m=>({first:m.probes.firstRequest.status,repeat:m.probes.repeatRequest.status,firstCache:m.probes.firstRequest.headers['cf-cache-status']??null,repeatCache:m.probes.repeatRequest.headers['cf-cache-status']??null,cacheControl:m.probes.repeatRequest.headers['cache-control'],transformed:m.probes.transformed.status})),
  mappingSha256:hash(fs.readFileSync(operationFile)),privateCopyStaged:false,privateRecoveryVerified:false,cdnRevocationVerified:false,mutationWorkflowsExercised:false};
 fs.writeFileSync(path.join(out,'prebuild-acceptance.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.end());
