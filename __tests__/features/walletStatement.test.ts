import { beforeEach, expect, it, vi } from "vitest";
import { createWalletQueries } from "@/features/wallet/application/queries/walletQueries";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import type { RequestContext } from "@/features/identity/domain/Principal";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const asOf = "2026-10-20T12:00:00Z";
const balance = {riderId:id,pointsBalance:44,lifetimePointsEarned:44,transactionCount:1,asOf};
const entry = {id:other,riderId:id,points:44,source:"standard_ride",category:"route" as const,description:"Recorded ride",createdAt:asOf};
const ledger = {getBalance:vi.fn(),listEntries:vi.fn()};
const queries = createWalletQueries({authorisation:authorisationService,ledger});
const ctx: RequestContext = {principal:{type:"rider",userId:other,email:null,riderId:id},permissions:["wallet.read"],correlationId:"test",audit:{actorUserId:other,actorEmail:null,principalType:"rider"}};
beforeEach(()=>{ledger.getBalance.mockReset().mockResolvedValue(balance);ledger.listEntries.mockReset().mockResolvedValue({entries:[entry],nextCursor:null,asOf});});
it("returns the authoritative complete statement without changing values",async()=>{
  expect(await queries.getStatement(ctx)).toEqual({ok:true,value:{balance,entries:[entry]}});
  expect(ledger.getBalance).toHaveBeenCalledTimes(2);
  expect(ledger.listEntries).toHaveBeenCalledWith(id,{asOf});
});
it("follows every ledger page and preserves signed debits",async()=>{
  ledger.getBalance.mockResolvedValue({...balance,transactionCount:2});
  const debit={...entry,id,points:-3,category:"adjustment"};
  ledger.listEntries.mockResolvedValueOnce({entries:[entry],nextCursor:"next",asOf}).mockResolvedValueOnce({entries:[debit],nextCursor:null,asOf});
  const result=await queries.getStatement(ctx);
  expect(result.ok && result.value.entries.map(e=>e.points)).toEqual([44,-3]);
  expect(ledger.listEntries).toHaveBeenLastCalledWith(id,{asOf,cursor:"next"});
});
it("retries a concurrent append before returning a coherent version",async()=>{
  const updated={...balance,transactionCount:2,pointsBalance:47};
  ledger.getBalance.mockResolvedValueOnce(balance).mockResolvedValueOnce(updated).mockResolvedValue(updated);
  ledger.listEntries.mockResolvedValueOnce({entries:[entry],nextCursor:null,asOf}).mockResolvedValue({entries:[entry,{...entry,id,points:3}],nextCursor:null,asOf});
  const result=await queries.getStatement(ctx);
  expect(result.ok && result.value.balance).toEqual(updated);
  expect(ledger.getBalance).toHaveBeenCalledTimes(4);
});
it("bounds retries and exposes incomplete/concurrent statements",async()=>{
  ledger.listEntries.mockResolvedValue({entries:[],nextCursor:null,asOf});
  expect(await queries.getStatement(ctx)).toMatchObject({ok:false,kind:"ConcurrencyConflict"});
  expect(ledger.getBalance).toHaveBeenCalledTimes(6);
});
it("rejects repeated cursors instead of truncating the ledger",async()=>{
  ledger.listEntries.mockResolvedValue({entries:[entry],nextCursor:"repeat",asOf});
  expect(await queries.getStatement(ctx)).toMatchObject({ok:false,message:"Invalid Wallet pagination"});
});
it("rejects a changed snapshot cutoff",async()=>{
  ledger.listEntries.mockResolvedValue({entries:[entry],nextCursor:null,asOf:"2026-10-21T12:00:00Z"});
  expect(await queries.getStatement(ctx)).toMatchObject({ok:false,message:"Wallet statement snapshot changed"});
});
it("rejects mixed-owner financial data even when counts match",async()=>{
  ledger.listEntries.mockResolvedValue({entries:[{...entry,riderId:other}],nextCursor:null,asOf});
  expect(await queries.getStatement(ctx)).toMatchObject({ok:false,kind:"permission_denied"});
});
it("denies capability and cross-account reads before touching the ledger",async()=>{
  expect(await queries.getStatement({...ctx,permissions:[]})).toMatchObject({ok:false,kind:"permission_denied"});
  expect(await queries.getStatement(ctx,other)).toMatchObject({ok:false,kind:"permission_denied"});
  expect(ledger.getBalance).not.toHaveBeenCalled();
});
it("requires explicit staff scope and rejects organisation principals",async()=>{
  const staff: RequestContext={...ctx,principal:{type:"admin",userId:other,email:null,adminUserId:other,role:"super_admin"}};
  expect(await queries.getStatement(staff)).toMatchObject({ok:false,kind:"validation"});
  expect((await queries.getStatement(staff,id)).ok).toBe(true);
  ledger.getBalance.mockClear();
  expect(await queries.getStatement({...ctx,principal:{type:"organisation",userId:other,email:null,organisationId:other,membershipId:other}})).toMatchObject({ok:false,kind:"permission_denied"});
  expect(ledger.getBalance).not.toHaveBeenCalled();
});
it("propagates an unavailable authoritative backend without fallback",async()=>{
  ledger.getBalance.mockRejectedValue(new Error("Wallet balance unavailable"));
  await expect(queries.getStatement(ctx)).rejects.toThrow("Wallet balance unavailable");
});
