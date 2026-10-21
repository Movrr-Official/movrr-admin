// Local-only visual verification of DOM exported by the real React tests.
// Prerequisites: npm run build; MOVRR_DETAILS_VISUAL=1 npm test -- userRelationships.
// Uses an isolated headless Chrome profile; no user session or production URL.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFile}=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../..'),out=path.join(repo,'.tmp/user-details-p1-20261021/visual'),staticRoot=path.join(repo,'.next/static');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe',cases=['rider-view','multi-view','multi-edit','multi-owner-edit'];
assert(fs.existsSync(chrome));const css=fs.readdirSync(path.join(staticRoot,'chunks')).filter(f=>f.endsWith('.css'));
const cssText=css.map(f=>fs.readFileSync(path.join(staticRoot,'chunks',f),'utf8')).join('\n');
const fonts=['manrope','jetbrains-mono'].flatMap(name=>cssText.match(new RegExp('--font-'+name+':[^;}]+'))?.[0]??[]).join(';');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');const name=url.pathname.slice(1);
 if(cases.includes(name)){
  const dom=fs.readFileSync(path.join(out,name+'.html'),'utf8');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en" style='${fonts}'><head>${css.map(f=>`<link rel="stylesheet" href="/static/chunks/${f}">`).join('')}</head><body class="min-h-screen bg-background text-foreground">${dom}<script>addEventListener('load',()=>setTimeout(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const d=document.querySelector('[data-slot="drawer-content"]'),cards=[...document.querySelectorAll('[data-slot="card"]')];const result={drawer:rect(d),font:getComputedStyle(d).fontFamily,cards:cards.map(e=>({title:e.querySelector('[data-slot="card-title"]')?.textContent,rect:rect(e),radius:getComputedStyle(e).borderRadius})),viewMutationControls:[...d.querySelectorAll('button')].map(e=>e.textContent.trim()).filter(s=>/Assign|Revoke|Save|Reset Password/.test(s))};const pre=document.createElement('script');pre.id='visual-metrics';pre.type='application/json';pre.textContent=JSON.stringify(result);document.body.append(pre);},100));</script></body></html>`);return;
 }
 if(url.pathname.startsWith('/static/')){const target=path.resolve(staticRoot,url.pathname.slice(8));if(!target.startsWith(staticRoot+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',target.endsWith('.css')?'text/css':target.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(fs.readFileSync(target));}catch{res.writeHead(404).end();}return;}
 res.writeHead(404).end();
});
(async()=>{try{await new Promise(r=>server.listen(3219,'127.0.0.1',r));const measurements={};
 for(const name of cases){const profile=path.join(out,'chrome-'+name),png=path.join(out,name+'.png');const stdout=await new Promise((resolve,reject)=>execFile(chrome,['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check','--hide-scrollbars','--user-data-dir='+profile,'--window-size=1440,1100','--virtual-time-budget=2000','--screenshot='+png,'--dump-dom','http://127.0.0.1:3219/'+name],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024},(e,out)=>e?reject(e):resolve(out)));
  assert(fs.existsSync(png));const match=String(stdout).match(/<script id="visual-metrics" type="application\/json">([\s\S]*?)<\/script>/);assert(match,'Browser measurements missing');measurements[name]=JSON.parse(match[1]);
 }
 const rider=measurements['rider-view'],multi=measurements['multi-view'];assert.deepEqual(multi.drawer,rider.drawer);assert.deepEqual(multi.cards.map(c=>c.title),rider.cards.map(c=>c.title));assert.deepEqual(multi.viewMutationControls,[]);assert.deepEqual(rider.viewMutationControls,[]);
 for(let i=0;i<2;i++){assert.equal(multi.cards[i].rect.width,rider.cards[i].rect.width);assert.equal(multi.cards[i].radius,rider.cards[i].radius);}
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({at:new Date().toISOString(),method:'actual React-test DOM and built production CSS rendered by isolated headless Chrome; local fixtures, not production browser acceptance',viewport:{width:1440,height:1100},measurements},null,2));console.log(JSON.stringify({screenshots:cases,readOnlyViewVerified:true,sharedDrawerAndCardGeometry:true,productionSessionsUsed:0}));
 }finally{server.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
