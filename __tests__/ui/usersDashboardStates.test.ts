// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({data:undefined as any, error:null as Error|null,isLoading:true,warnings:[] as string[],refetch:vi.fn()}));
vi.mock("@/hooks/useUsersData",()=>({useUsersData:()=>({...state,isFetching:false})}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock("@/components/users/UsersTable",()=>({UsersTable:({users}:any)=>React.createElement("div",{"data-testid":"table"},users.length?users.map((u:any)=>u.name).join(","):"No Users Found")}));
import Overview from "@/app/users/UsersOverview";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("React",React);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);state.data=undefined;state.error=null;state.isLoading=true;state.warnings=[];state.refetch.mockClear();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const show=()=>act(async()=>root.render(React.createElement(Overview)));
describe("actual Users overview data states",()=>{
  it("shows loading without zero statistics or an empty table",async()=>{
    await show();expect(host.textContent).toContain("Loading users");expect(host.textContent).not.toContain("Total Users");expect(host.textContent).not.toContain("No Users Found");
  });
  it.each(["permission denied for table account_auth_sync","Missing capability: users.read","API unavailable","request timed out"])("shows %s as an actionable error",async message=>{
    state.isLoading=false;state.error=new Error(message);await show();expect(host.querySelector('[role="alert"]')?.textContent).toContain(message);expect(host.textContent).not.toContain("No Users Found");expect(host.textContent).not.toContain("Total Users");
    await act(async()=>host.querySelector("button")!.click());expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("hides stale private totals after a failed refresh",async()=>{
    state.data=[];state.isLoading=false;state.error=new Error("Permission denied");await show();expect(host.textContent).not.toContain("Total Users");
  });
  it("renders genuine zero counts only after a successful empty result",async()=>{
    state.data=[];state.isLoading=false;await show();expect(host.textContent).toContain("Total Users");expect(host.textContent).toContain("No Users Found");expect(host.querySelector('[role="alert"]')).toBeNull();
  });
  it("preserves real accounts and reports partial activity unavailable",async()=>{
    state.data=[{id:"only",name:"Real authorized user",createdAt:"2026-10-21T00:00:00Z",status:"active",memberships:[],domains:[]}];state.isLoading=false;state.warnings=["Recent activity is unavailable. Retry to refresh activity statistics."];await show();
    expect(host.textContent).toContain("Real authorized user");expect(host.textContent).toContain("Activity data unavailable");expect(host.textContent).not.toContain("No Users Found");expect(host.textContent).not.toContain("Active in last 30 days");
  });
});
