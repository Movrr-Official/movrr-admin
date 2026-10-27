// Run from a separately scheduled process outside Supabase/its cron scheduler.
// Disabled by default. Installation, secrets and activation require separate authorization.
// It invokes only the operational monitor, never the financial worker or recovery RPCs.
const {randomUUID}=require('node:crypto');
async function check(env=process.env,send=fetch){
 if(env.RIDE_OPS_WATCHDOG_ENABLED!=='true')return{enabled:false};
 const origin=new URL(env.MOVRR_ADMIN_ORIGIN||'');
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('watchdog_origin_invalid');
 const token=env.RIDE_SETTLEMENT_WATCHDOG_TOKEN;
 if(!token||token.length<32)throw Error('watchdog_token_required');
 const correlation=randomUUID();
 // Retry transport failures and server errors with a bounded timeout. Database queue deduplicates.
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await send(new URL('/api/internal/ride-settlement-watchdog',origin),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-correlation-id':correlation},body:'{}',signal:AbortSignal.timeout(15000),redirect:'error'});
   if(response.status===401||response.status===403)throw Error('watchdog_authorization_failed');
   if(!response.ok)throw Error('watchdog_monitor_unavailable');
   const data=await response.json();
   if(data.enabled!==true)throw Error('watchdog_monitor_disabled');
   return{enabled:true,monitorObserved:true,attempt,correlationId:correlation};
  }catch(e){const category=['watchdog_authorization_failed','watchdog_monitor_disabled','watchdog_monitor_unavailable'].includes(e?.message)?e.message:'watchdog_transport_failed';if(attempt===3||category==='watchdog_authorization_failed'||category==='watchdog_monitor_disabled')throw Error(category);}
 }
}
module.exports={check};
if(require.main===module)check().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error(JSON.stringify({event:'ride_ops_independent_watchdog_failed',action:'Assigned Super Admin must inspect the scheduler run and Admin incidents',privateDetailsSuppressed:true}));process.exitCode=1;});
