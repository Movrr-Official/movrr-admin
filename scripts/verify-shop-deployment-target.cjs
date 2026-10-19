const fs=require('node:fs'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const expected='kzdvunpuxaxlphqvmzxw.supabase.co';
const linked=JSON.parse(fs.readFileSync('.vercel/project.json','utf8'));
assert.equal(linked.projectId,'prj_VdWMMAnBPo7u5G9RPmlA6t9hMgCT');
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,expected);
if(process.env.SUPABASE_URL)assert.equal(new URL(process.env.SUPABASE_URL).hostname,expected);
assert(process.env.SUPABASE_SERVICE_ROLE_KEY,'Service binding missing');
// Vercel deliberately does not export production Secret values. Verify their
// project metadata instead of downgrading a secret to a readable Config value.
const listed=spawnSync('cmd.exe',['/d','/s','/c','vercel.cmd env ls production --scope movrrops-projects'],{encoding:'utf8',windowsHide:true});
assert.equal(listed.status,0,'Production environment metadata unavailable');
assert(/CRON_SECRET[^\r\n]*(Hidden|Secret)[^\r\n]*Production/.test(listed.stdout+listed.stderr),'Authenticated recovery cron not configured');
assert(process.env.RESEND_API_KEY,'Reward email delivery not configured');
assert(!['true','1'].includes(String(process.env.NEXT_PUBLIC_USE_MOCK_DATA).toLowerCase()),'Production mock data must be disabled');
const result={verifiedAt:new Date().toISOString(),projectId:linked.projectId,productionDatabase:expected,
 serviceBindingPresent:true,recoverySecretPresent:true,emailBindingPresent:true,mockDataDisabled:true,secretsExported:false};
fs.mkdirSync('docs/verification/shop-redemption',{recursive:true});
fs.writeFileSync('docs/verification/shop-redemption/vercel-target.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
