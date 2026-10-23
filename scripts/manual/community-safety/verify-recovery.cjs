// LOCAL ONLY. Restore the captured schema and minimal Community recovery records.
// No production connection, identities created, notification delivery or restore.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),postgres=require('postgres');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/community-safety-production-20261023');
const options={host:'127.0.0.1',port:55469,username:'postgres',password:'isolated-local-test-only',max:1,onnotice(){}};
const root=postgres({...options,database:'postgres'}),name='safety_recovery_'+process.pid,db=postgres({...options,database:name});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),quote=s=>'"'+s.replaceAll('"','""')+'"';
(async()=>{
 const pre=JSON.parse(fs.readFileSync(path.join(out,'preflight.json'),'utf8')),backup=JSON.parse(fs.readFileSync(path.join(out,'backup.json'),'utf8'));
 await root.unsafe('CREATE DATABASE '+name);
 for(const role of pre.roles)if(role.rolname!=='postgres')await db.unsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role.rolname.replaceAll("'","''")}') THEN CREATE ROLE ${quote(role.rolname)} NOLOGIN ${role.rolbypassrls?'BYPASSRLS':''}; END IF; END $$;`);
 await db.unsafe('CREATE SCHEMA extensions; CREATE SCHEMA shop_transport; CREATE EXTENSION postgis; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION http WITH SCHEMA shop_transport;');
 await db.unsafe(fs.readFileSync(path.join(out,'production-schema-only.sql'),'utf8').replace(/^\\.*$/gm,'').replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;'));
 let records=0;for(const [table,rows] of Object.entries(backup.baseline.data)){
  // Restoring only Community rows deliberately omits account/financial data.
  // Disable FK and outbound triggers ONLY in this disposable local database.
  await db.unsafe(`ALTER TABLE public.${quote(table)} DISABLE TRIGGER ALL`);
  if(rows.length)await db.unsafe(`INSERT INTO public.${quote(table)} SELECT * FROM jsonb_populate_recordset(NULL::public.${quote(table)},$1::text::jsonb)`,[JSON.stringify(rows)]);
  const actual=JSON.parse(JSON.stringify(await db.unsafe(`SELECT * FROM public.${quote(table)} ORDER BY 1`)));assert.deepEqual(actual,rows);records+=rows.length;
 }
 for(const m of backup.mappings)assert.equal(hash(fs.readFileSync(path.join(out,m.file))),m.sha256);
 const result={verified:true,recordedAt:new Date().toISOString(),schemaTables:(await db`SELECT count(*)::int n FROM pg_tables WHERE schemaname IN ('public','auth','storage')`)[0].n,communityTables:Object.keys(backup.baseline.data).length,recordsRestored:records,originalCoverBytesVerified:backup.mappings.length,scope:'Exact typed Community recovery records; account/financial parents remain in production and were not copied. Triggers disabled exclusively in disposable local restoration.',productionMutations:false};fs.writeFileSync(path.join(out,'recovery-verified.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await db.end();await root.unsafe('DROP DATABASE IF EXISTS '+name+' WITH(FORCE)');await root.end()});
