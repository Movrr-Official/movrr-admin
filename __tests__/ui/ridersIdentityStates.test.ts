// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({read:vi.fn(),data:undefined as any,error:null as Error|null,isLoading:true,refetch:vi.fn()}));
vi.mock("@/hooks/useRidersData",()=>({useRidersData:()=>state}));
vi.mock("@/components/riders/RidersTable",()=>({RidersTable:()=>React.createElement("div",null,"Riders table")}));
vi.mock("@/hooks/useToast",()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock("@/hooks/useRiderBadgesData",()=>({useRiderBadges:()=>({data:[]}),useBadgeDefinitions:()=>({data:[]}),useRevokeRiderBadge:()=>({}),useAwardRiderBadge:()=>({})}));
vi.mock("@/app/actions/users",()=>({getUserActivityLogs:state.read,getUserRoutes:state.read,getUserCampaigns:state.read,getUserRewardTransactions:state.read,getUserPointsBalance:state.read,exportUserData:state.read,sendPasswordResetEmail:state.read}));
vi.mock("@/app/actions/riders",()=>({getCommunityRideCreatorAccess:state.read,setCommunityRideCreatorAccess:state.read,updateRiderProfile:state.read}));
vi.mock("@/app/actions/riderPerformance",()=>({getRiderPerformanceMetrics:state.read}));
import Overview from "@/app/riders/RidersOverview";
import { RiderDetailsDrawer } from "@/components/riders/RiderDetailsDrawer";
let host:HTMLDivElement,root:Root,client:QueryClient;
beforeEach(()=>{vi.stubGlobal("React",React);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});state.read.mockReset();state.data=undefined;state.error=null;state.isLoading=true;host=document.createElement("div");document.body.append(host);root=createRoot(host);client=new QueryClient({defaultOptions:{queries:{retry:false}}});});
afterEach(async()=>{await act(async()=>root.unmount());client.clear();host.remove();vi.unstubAllGlobals();});
it("shows shared reader loading/failure instead of fabricated Rider statistics",async()=>{
  await act(async()=>root.render(React.createElement(Overview)));expect(host.textContent).toContain("Loading riders");expect(host.textContent).not.toContain("Total Riders");
  state.isLoading=false;state.error=new Error("Auth activity unavailable");await act(async()=>root.render(React.createElement(Overview)));expect(host.textContent).toContain("Auth activity unavailable");expect(host.textContent).not.toContain("Total Riders");
});
it.each([null,"null",""])("never sends an orphan Rider's %s user reference to account handlers",async userId=>{
  const rider={id:"00000000-0000-4000-8000-000000000001",userId,name:"Existing orphan profile"} as any;
  await act(async()=>root.render(React.createElement(QueryClientProvider,{client},React.createElement(RiderDetailsDrawer,{rider,open:true,onOpenChange:()=>{}}))));
  expect(document.body.textContent).toContain("Linked account unavailable");expect(state.read).not.toHaveBeenCalled();
});
