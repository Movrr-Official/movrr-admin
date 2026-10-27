import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(new URL('../../operations/ride-watchdog/package.json', import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

test('actual workerd scheduler succeeds, rejects redirects and bounds retries', async () => {
  const root=path.resolve(import.meta.dirname,'../..');
  fs.mkdirSync(path.join(root,'.tmp'),{recursive:true});
  const output=fs.mkdtempSync(path.join(root,'.tmp/ride-watchdog-runtime-'));
  try {
    execFileSync(process.execPath,[path.join(root,'operations/ride-watchdog/node_modules/wrangler/bin/wrangler.js'),'deploy','--config',path.join(root,'operations/ride-watchdog/wrangler.jsonc'),'--dry-run','--outdir',output],{cwd:root,windowsHide:true,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    const script=fs.readFileSync(path.join(output,'index.js'),'utf8');
    for(const status of [200,302,503]){
      let calls=0;
      const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat'],unsafeTriggerHandlers:true,bindings:{MOVRR_ADMIN_ORIGIN:'https://synthetic.example.invalid',RIDE_OPS_WATCHDOG_ENABLED:'true',RIDE_SETTLEMENT_WATCHDOG_TOKEN:'synthetic-only-token-at-least-32-characters'},outboundService:async request=>{calls++;assert.equal(new URL(request.url).origin,'https://synthetic.example.invalid');assert.equal(new URL(request.url).pathname,'/api/internal/ride-settlement-watchdog');return status===200?Response.json({enabled:true}):new Response('',{status,headers:status===302?{location:'https://must-not-follow.invalid'}:{}});}}));
      try{const response=await mf.dispatchFetch('http://localhost/cdn-cgi/local/scheduled?cron=*+*+*+*+*');assert.equal(response.status,status===200?200:500);assert.equal(calls,status===200?1:3);}finally{await mf.dispose();}
    }
  } finally { assert(path.resolve(output).startsWith(path.resolve(root,'.tmp')+path.sep)); fs.rmSync(output,{recursive:true,force:true}); }
});
