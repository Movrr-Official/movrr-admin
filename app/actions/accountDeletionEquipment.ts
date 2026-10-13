"use server";
import { requireCapability } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
const validId=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function executeAccountDeletionEquipmentReturn(caseId:string,proposalId:string,proofCaseId:string){
 try{
  const actor=await requireCapability("privacy.deletion.operations.review",{mutation:true});
  if(![caseId,proposalId,proofCaseId].every(validId))return{success:false as const,error:"Invalid return proof"};
  const result=await createSupabaseAdminClient().rpc("execute_account_deletion_equipment_resolution",{p_case:caseId,p_proposal:proposalId,p_actor:actor.authUser.id,p_proof:proofCaseId});
  if(result.error||result.data?.state!=="confirmed")return{success:false as const,error:"Independent return evidence and approved custody policy required"};
  return{success:true as const};
 }catch{return{success:false as const,error:"Equipment resolution unavailable or unauthorized"};}
}
