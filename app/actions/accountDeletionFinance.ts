"use server";

import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";

const validId=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function executeAccountDeletionFinancialResolution(caseId:string,proposalId:string,action:string){
 try{
  const actor=await requireCapability("privacy.deletion.finance.review",{mutation:true});
  if(!validId(caseId)||!validId(proposalId)||!["honor_proven_fulfilment","approved_proven_alternative","verified_refund"].includes(action))
   return{success:false as const,error:"Invalid financial disposition"};
  const db=createSupabaseAdminClient();
  const args={p_case:caseId,p_proposal:proposalId,p_actor:actor.authUser.id};
  const resolution=await db.rpc("execute_account_deletion_financial_resolution",{...args,p_action:action});
  if(resolution.error||resolution.data?.state!=="confirmed")return{success:false as const,error:"Approved policy and trustworthy financial or partner proof required"};
  if(action==="verified_refund"&&!resolution.data.obligationResolved){
   const timeline=await db.rpc("get_account_deletion_refund_timeline",args);
   if(timeline.error||!timeline.data?.id)return{success:false as const,error:"Refund committed; canonical timeline requires review. Do not issue another refund."};
   const current=createFulfilment(timeline.data);
   if(!["instant_digital","qr_barcode"].includes(current.fulfilmentType))return{success:false as const,error:"Unsupported fulfilment requires approved Finance review."};
   // The database validates the legal refund edge and its existing proof/approval.
   const committed=await db.rpc("commit_account_deletion_refund_timeline",{...args,p_from:current.state,p_version:current.version,p_event:crypto.randomUUID()});
   if(committed.error||committed.data?.obligationResolved!==true)return{success:false as const,error:"Refund committed; timeline result requires reconciliation."};
  }
  return{success:true as const};
 }catch{return{success:false as const,error:"Financial execution unavailable or unauthorized"};}
}
