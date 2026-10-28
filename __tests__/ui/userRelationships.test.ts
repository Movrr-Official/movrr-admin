// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/schemas";
import type { AccountMembership } from "@/features/identity/domain/membershipManagement";
import { mkdirSync, writeFileSync } from "node:fs";
const state = vi.hoisted(() => ({ allowed: true, approve: true, assign: true, rows: [] as AccountMembership[], read: vi.fn(), change: vi.fn(), orgs: vi.fn(), invites: vi.fn(), issue: vi.fn(), retry: vi.fn(async () => {}), riderRead: vi.fn(async () => ({success:true,data:[]})), update: vi.fn(async (_input: unknown) => ({success:true})) }));
vi.mock("@/hooks/useAdminUser", () => ({ useCapability: (cap: string) => state.allowed && (cap !== "users.role.approve" || state.approve) && (cap !== "users.role.assign" || state.assign) }));
vi.mock("@/app/actions/accountMemberships", () => ({ getAccountMemberships: state.read, getAccountOrganisations: state.orgs, getAccountInvitations: state.invites, changeAccountMembership: state.change, issueAccountInvitation: state.issue, revokeAccountInvitation: vi.fn(async () => ({success:true,data:null})), retryAccountAuthSynchronization: state.retry }));
vi.mock("@/app/actions/users", () => ({ updateUser: state.update, sendPasswordResetEmail: vi.fn(), exportUserData: vi.fn(), getUserActivityLogs: async () => ({success:true,data:[]}), getUserRoutes: state.riderRead, getUserCampaigns: state.riderRead, getUserRewardTransactions: state.riderRead, getUserPointsBalance: state.riderRead }));
vi.mock("@/app/actions/accountAccess", () => ({ getAccountAccess: async () => ({ success: true, data: { userId: "synthetic", eligible: true, hasPassword: false, lastSignInAt: null, memberships: [] } }), sendAccountAccess: vi.fn() }));
import { UserRelationships } from "@/components/users/UserRelationships";
import { OrganisationMembershipEditor } from "@/components/users/OrganisationMembershipEditor";
import { AccountStatusRecovery } from "@/components/users/AccountStatusRecovery";
import { UserDetailsDrawer } from "@/components/users/UserDetailsDrawer";
import { getUsersTableColumns } from "@/components/users/UsersTableColumns";
const id = "11111111-1111-4111-8111-111111111111", orgId = "22222222-2222-4222-8222-222222222222";
const member: AccountMembership = { id: "33333333-3333-4333-8333-333333333333", organisationId: orgId, organisationName: "Actual Partner", domain: "partner", role: "partner_operations_manager", status: "active", updatedAt: "2026-10-21T00:00:00.123456+00:00", isLastActiveOwner: false };
const user = (extra: Partial<User> = {}) => ({ id, name: "Independent account", email: "user@example.test", languagePreference:"en", isVerified:false, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", status: "active", memberships: [], ...extra }) as User;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  state.allowed = true; state.approve = true; state.assign = true; state.rows = []; vi.clearAllMocks();
  state.read.mockImplementation(async () => ({success:true,data:[...state.rows]}));
  state.orgs.mockResolvedValue({success:true,data:[{id:orgId,name:"Actual Partner",type:"reward_partner",status:"active"}]});
  state.invites.mockResolvedValue({success:true,data:[]});
  state.issue.mockImplementation(async () => ({success:true,data:{url:"https://app.example.test/accept?token=local-fixture"}}));
  state.change.mockImplementation(async (input: { organisationId:string; role:AccountMembership["role"];status:AccountMembership["status"] }) => {
    const updated = { ...member, ...state.rows.find(row=>row.organisationId===input.organisationId), role:input.role,status:input.status,updatedAt:"2026-10-21T00:00:01.654321+00:00" };
    state.rows = state.rows.some(row=>row.organisationId===input.organisationId) ? state.rows.map(row=>row.organisationId===input.organisationId?updated:row) : [...state.rows,updated];
    return {success:true,data:state.rows[0]};
  });
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function show(element: React.ReactElement) { await act(async () => root.render(element)); }
async function editor(onChange = vi.fn()) { await show(React.createElement("form",null,React.createElement(OrganisationMembershipEditor,{userId:id,onChange}))); }
const button = (label: string) => [...document.body.querySelectorAll("button")].find(node=>node.textContent?.trim()===label)!;
async function click(label: string) { expect(button(label),label).toBeDefined();await act(async()=>button(label).click()); }
async function select(value: string) {const native=[...document.body.querySelectorAll("select")].find(node=>[...node.options].some(option=>option.value===value))!;expect(native,value).toBeDefined();await act(async()=>{native.value=value;native.dispatchEvent(new Event("change",{bubbles:true}));});}
function capture(name:string){if(process.env.MOVRR_DETAILS_VISUAL==="1"){mkdirSync(".tmp/user-details-p1-20261021/visual",{recursive:true});writeFileSync(`.tmp/user-details-p1-20261021/visual/${name}.html`,document.body.innerHTML);}}

describe("read-only User Details uses the established hierarchy",()=>{
  it.each([
    ["Unassigned",{}],["Rider",{riderStatus:"active"}],
    ["Partner",{memberships:[member]}],
    ["Advertiser",{memberships:[{...member,domain:"advertiser",role:"viewer"}]}],
    ["Government",{memberships:[{...member,domain:"government",role:"viewer"}]}],
    ["Internal Staff",{employeeRole:"support_agent"}],
    ["Partner",{riderStatus:"active",employeeRole:"support_agent",memberships:[{...member,role:"owner",isLastActiveOwner:true}]}],
  ] as const)("shows %s with no membership mutations or membership reads",async(label,extra)=>{
    await show(React.createElement(UserDetailsDrawer,{user:user(extra as Partial<User>),open:true,onOpenChange:()=>{}}));
    const content=document.body.textContent??"";
    expect(content).toContain(label);expect(content).not.toContain("Rider membership");
    for(const action of ["Assign to Organisation","Assign Staff Role","Save Assignment","Revoke membership","Organisation Role","Retry account activation","Reset Password"]) expect(content).not.toContain(action);
    expect(document.body.querySelector('section[aria-label="Organisation Memberships"]')).toBeNull();
    expect(state.read).not.toHaveBeenCalled();expect(state.orgs).not.toHaveBeenCalled();expect(state.invites).not.toHaveBeenCalled();
    const cards=[...document.body.querySelectorAll('[data-slot="card"]')];
    expect(cards[0].textContent).toContain("Basic Information");expect(cards[1].textContent).toContain("Account Activity");
    expect(cards[0].className).toContain("border-border");
    if(!("memberships" in extra)){expect(content).not.toContain("Organisation Memberships");expect(content).not.toContain("Organization");}
    if(label==="Rider") capture("rider-view");
    if("riderStatus" in extra&&"employeeRole" in extra){expect(cards[0].textContent).toContain("Actual Partner");capture("multi-view");}
  });
  it("keeps account Status independent and derives Unassigned without a legacy role",async()=>{
    await show(React.createElement(UserRelationships,{user:user({role:"rider",status:"inactive"})}));expect(host.textContent).toBe("Unassigned");
    const column=getUsersTableColumns().find(item=>"accessorKey" in item&&item.accessorKey==="status")!;
    await show((column.cell as (props:unknown)=>React.ReactElement)({row:{getValue:()=>"inactive",original:user({riderStatus:"active"})}}));expect(host.textContent).toBe("Inactive");
  });
  it("keeps healthy and pending recovery out of View mode",async()=>{
    await show(React.createElement(UserDetailsDrawer,{user:user({authSyncPending:true}),open:true,onOpenChange:()=>{}}));expect(document.body.textContent).not.toContain("Retry account activation");
    await click("Edit");expect(document.body.textContent).toContain("Retry account activation");
  });
  it("preserves unsaved profile edits and their optimistic baseline across membership refresh",async()=>{
    const original=user();await show(React.createElement(UserDetailsDrawer,{user:original,open:true,onOpenChange:()=>{}}));await click("Edit");
    const name=document.body.querySelector<HTMLInputElement>('input[name="name"]')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(name,"Unsaved profile");name.dispatchEvent(new Event("input",{bubbles:true}));});
    await show(React.createElement(UserDetailsDrawer,{user:{...original,memberships:[member],updatedAt:"2026-10-21T00:00:02Z"},open:true,onOpenChange:()=>{}}));
    expect(name.value).toBe("Unsaved profile");await click("Save");
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({name:"Unsaved profile",expectedUpdatedAt:original.updatedAt}));
    expect(state.update.mock.calls[0][0]).not.toHaveProperty("employeeRole");
  });
  it("uses the same drawer for View/Edit/Save/Reload/Revoke/Reload",async()=>{
    state.rows=[member];const refresh=vi.fn();let current=user({riderStatus:"active",employeeRole:"support_agent",memberships:[member]});
    const render=()=>show(React.createElement(UserDetailsDrawer,{user:current,open:true,onOpenChange:()=>{},onUserUpdate:refresh}));
    await render();await click("Edit");expect(document.body.textContent).toContain("Edit User");capture("multi-edit");
    expect(button("Save").disabled).toBe(false);await click("Save");
    expect([...document.body.querySelectorAll('[data-slot="form-message"]')].map(node=>node.textContent)).toEqual([]);
    expect(state.update).toHaveBeenCalledOnce();await render();expect(document.body.textContent).toContain("User Details");
    await click("Edit");await click("Revoke membership");expect(state.change).toHaveBeenCalledWith(expect.objectContaining({expectedUpdatedAt:member.updatedAt,status:"revoked"}));
    expect(document.body.textContent).toContain("Organisation membership revoked.");
    current={...current,memberships:[{...member,status:"revoked"}]};await render();await click("Cancel");
    expect(document.body.textContent).not.toContain("Actual Partner");expect(document.body.textContent).toContain("Rider");expect(document.body.textContent).toContain("Internal Staff");
  });
});
describe("canonical membership editor feedback and controls",()=>{
  it("preserves another membership's unsaved role while saving one assignment",async()=>{
    state.rows=[member,{...member,id:"44444444-4444-4444-8444-444444444444",organisationId:"55555555-5555-4555-8555-555555555555",organisationName:"Second Partner"}];await editor();
    const controls=[...document.body.querySelectorAll("select")];
    await act(async()=>{controls[0].value="staff";controls[0].dispatchEvent(new Event("change",{bubbles:true}));controls[1].value="viewer";controls[1].dispatchEvent(new Event("change",{bubbles:true}));});
    await act(async()=>[...document.body.querySelectorAll("button")].filter(node=>node.textContent==="Save Assignment")[0].click());
    const second=[...document.body.querySelectorAll("button")].filter(node=>node.textContent==="Save Assignment")[1];expect(second.disabled).toBe(false);
    await act(async()=>second.click());expect(state.rows.map(row=>row.role)).toEqual(["staff","viewer"]);
  });
  it("shows sole Owner protection in the existing multi-domain Edit drawer",async()=>{
    const owner={...member,role:"owner" as const,isLastActiveOwner:true};state.rows=[owner];
    await show(React.createElement(UserDetailsDrawer,{user:user({riderStatus:"active",employeeRole:"support_agent",memberships:[owner]}),open:true,initialMode:"edit",onOpenChange:()=>{}}));
    expect(document.body.textContent).toContain("Edit User");expect(button("Revoke membership").disabled).toBe(true);capture("multi-owner-edit");
  });
  it("does not treat role approval as permission to revoke non-Owner grants",async()=>{
    state.assign=false;state.rows=[{...member,role:"staff"}];await editor();expect(button("Revoke membership")).toBeUndefined();
    await select("owner");await click("Save Assignment");expect(state.change).toHaveBeenCalledWith(expect.objectContaining({role:"owner"}));
  });
  it("loads the assignment form only on explicit action",async()=>{
    await editor();expect(state.orgs).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain("Select organisation");
    await click("Assign to Organisation");expect(state.orgs).toHaveBeenCalledOnce();expect(document.body.textContent).toContain("Organisation Role");
    await select(orgId);await click("Save Assignment");expect(state.change).toHaveBeenCalledWith({userId:id,organisationId:orgId,role:"viewer",status:"active",expectedUpdatedAt:null});
    expect(document.body.textContent).toContain("Organisation assignment saved.");
  });
  it("stages a role change until Save Assignment and preserves microsecond versions",async()=>{
    state.rows=[member];await editor();await select("staff");expect(state.change).not.toHaveBeenCalled();
    await click("Save Assignment");expect(state.change).toHaveBeenCalledWith(expect.objectContaining({role:"staff",expectedUpdatedAt:member.updatedAt}));expect(state.rows[0].role).toBe("staff");
    await click("Revoke membership");expect(state.change).toHaveBeenLastCalledWith(expect.objectContaining({role:"staff",status:"revoked",expectedUpdatedAt:"2026-10-21T00:00:01.654321+00:00"}));
  });
  it("disables sole Owner demotion/revocation with an explicit explanation",async()=>{
    state.rows=[{...member,role:"owner",isLastActiveOwner:true}];await editor();expect(button("Revoke membership").disabled).toBe(true);expect(button("Save Assignment").disabled).toBe(true);
    expect(document.body.textContent).toContain("Assign another active Owner first");await click("Revoke membership");expect(state.change).not.toHaveBeenCalled();
  });
  it("does not offer Owner mutations without approval authority",async()=>{
    state.approve=false;state.rows=[{...member,role:"owner"}];await editor();expect(document.body.textContent).toContain("Owner");expect(button("Revoke membership")).toBeUndefined();expect(button("Save Assignment")).toBeUndefined();
  });
  it("allows an authorized Owner revoke only when another active Owner exists",async()=>{
    state.rows=[{...member,role:"owner"}];await editor();expect(button("Revoke membership").disabled).toBe(false);await click("Revoke membership");expect(state.rows[0].status).toBe("revoked");
  });
  it.each(["denied","conflict","last_owner"])("shows the meaningful %s denial without claiming success",async code=>{
    state.rows=[member];state.change.mockResolvedValueOnce({success:false,error:{code,message:code==="last_owner"?"Cannot remove last active organisation owner":"Current access or membership version no longer permits this change"}});
    await editor();await click("Revoke membership");expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(code==="last_owner"?"last active organisation owner":"no longer permits");
    expect(document.body.textContent).not.toContain("membership revoked.");expect(state.rows[0].status).toBe("active");
  });
  it("distinguishes a committed change from a subsequent readback failure",async()=>{
    state.rows=[member];await editor();state.read.mockResolvedValueOnce({success:false,error:{code:"unavailable",message:"Readback unavailable"}});await click("Revoke membership");
    expect(state.rows[0].status).toBe("revoked");expect(document.body.textContent).toContain("change was saved, but");expect(button("Reload memberships")).toBeDefined();expect(button("Revoke membership")).toBeUndefined();
  });
  it("does not fabricate empty memberships or enable controls after a failed read",async()=>{
    state.read.mockResolvedValueOnce({success:false,error:{code:"unavailable",message:"Membership data unavailable"}});await editor();expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Membership data unavailable");expect(button("Assign to Organisation")).toBeUndefined();
  });
  it("keeps read-only operators out of assignment/revoke controls",async()=>{
    state.allowed=false;state.rows=[member];await editor();expect(document.body.textContent).toContain("Actual Partner");expect(button("Assign to Organisation")).toBeUndefined();expect(button("Revoke membership")).toBeUndefined();
  });
  it("reveals revoked assignments only through Access History",async()=>{
    state.rows=[{...member,status:"revoked"}];await editor();expect(document.body.textContent).not.toContain("Actual Partner");await click("Access History");expect(document.body.textContent).toContain("Revoked");await click("Access History");expect(document.body.textContent).not.toContain("Actual Partner");
  });
  it("retains a new invitation URL across readback and parent refresh",async()=>{
    state.rows=[{...member,status:"invited"}];await editor();await click("Create invitation link");expect(document.body.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("local-fixture");await editor();expect(document.body.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("local-fixture");
  });
  it("keeps recovery authorized and pending-only within Edit User",async()=>{
    await show(React.createElement(AccountStatusRecovery,{userId:id,pending:false}));expect(host.textContent).toBe("");await show(React.createElement(AccountStatusRecovery,{userId:id,pending:true}));await click("Retry account activation or suspension");expect(state.retry).toHaveBeenCalledWith(id);
    state.allowed=false;await show(React.createElement(AccountStatusRecovery,{userId:id,pending:true}));expect(host.textContent).toBe("");
  });
});
