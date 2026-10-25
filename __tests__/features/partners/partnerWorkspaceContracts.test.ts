import { expect, it, vi } from "vitest";
import { createPartnerQueries } from "@/features/partners/application/partnerServices";
import { authorisationService, withPermissions } from "@/features/organisations/application/commands/authorisationService";
import { createFulfilment } from "@/features/fulfilment/domain/Fulfilment";
import type { RequestContext } from "@/features/identity/domain/Principal";
const context = (role="owner", org="tenant"): RequestContext => withPermissions({ principal: { type:"organisation",userId:"actor",email:null,organisationId:org,membershipId:"membership",role:role as "owner",organisationType:"reward_partner" },correlationId:"test",permissions:[],audit:{actorUserId:"actor",actorEmail:null,principalType:"organisation"} });
it("lists tenant drafts and paused items through the scoped catalog read, without changing the public catalog", async () => {
  const scoped=vi.fn(async()=>[{id:"draft",title:"Coffee",status:"draft",partnerOrgId:"tenant"} as never]);const publicList=vi.fn(async()=>[]);
  const queries=createPartnerQueries({authorisation:authorisationService,listCatalogForOrg:scoped,listCatalog:publicList});
  const result=await queries.listRewards(context());expect(result.ok).toBe(true);if(result.ok)expect(result.value).toMatchObject([{id:"draft",status:"draft"}]);
  expect(scoped).toHaveBeenCalledWith("tenant");expect(publicList).not.toHaveBeenCalled();
});
it("enriches the pending queue with reward names while excluding other organisations", async () => {
  const fulfilment=createFulfilment({id:"collection",redemptionId:"order",riderId:"rider",catalogItemId:"coffee",fulfilmentType:"qr_barcode",partnerOrgId:"tenant",state:"validated",idempotencyKey:"fixture"});
  const queries=createPartnerQueries({authorisation:authorisationService,listFulfilments:async()=>[fulfilment,{...fulfilment,id:"foreign",partnerOrgId:"foreign"}],listCatalogForOrg:async()=>[{id:"coffee",title:"Coffee",partnerOrgId:"tenant"} as never]});
  const result=await queries.pendingFulfilments(context());expect(result.ok).toBe(true);if(result.ok)expect(result.value).toMatchObject([{id:"collection",rewardTitle:"Coffee"}]);
});

it("keeps collection history scoped and separates closed outcomes from the pending queue", async () => {
  const base=createFulfilment({id:"completed",redemptionId:"order",riderId:"rider",catalogItemId:"coffee",fulfilmentType:"qr_barcode",partnerOrgId:"tenant",state:"completed",idempotencyKey:"fixture"});
  const read=vi.fn(async()=>[base,{...base,id:"cancelled",state:"cancelled" as const},{...base,id:"pending",state:"validated" as const},{...base,id:"processing",state:"processing" as const},{...base,id:"foreign",partnerOrgId:"foreign"}]);
  const queries=createPartnerQueries({authorisation:authorisationService,listFulfilments:read,listCatalogForOrg:async()=>[{id:"coffee",title:"Coffee",partnerOrgId:"tenant"} as never]});
  const result=await queries.fulfilmentHistory(context());expect(result.ok).toBe(true);if(result.ok)expect(result.value).toMatchObject([{id:"completed",rewardTitle:"Coffee"},{id:"cancelled"}]);
  const pending=await queries.pendingFulfilments(context());if(pending.ok)expect(pending.value).toMatchObject([{id:"pending"}]);
  read.mockClear();const denied=await queries.fulfilmentHistory({...context(),permissions:[]});expect(denied.ok).toBe(false);expect(read).not.toHaveBeenCalled();
  const admin=await queries.fulfilmentHistory({...context(),principal:{type:"admin",userId:"admin",adminUserId:"admin",email:null,role:"super_admin"}});expect(admin.ok).toBe(false);expect(read).not.toHaveBeenCalled();
});
