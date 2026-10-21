// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/schemas";
import { applyFilters, type FilterConfig } from "@/lib/applyFilters";

const state = vi.hoisted(() => ({
  users: [] as User[], table: null as null | { data: User[]; filterConfig: FilterConfig[] },
  create: vi.fn(async (_input: unknown) => ({ success: true })), push: vi.fn(),
  organisations: vi.fn(async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Partner fixture", type: "reward_partner", status: "active" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Advertiser fixture", type: "advertiser", status: "active" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Government fixture", type: "government", status: "active" },
  ]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/users", () => ({ createUser: state.create }));
vi.mock("@/app/actions/accountMemberships", () => ({ getAccountOrganisations: async () => ({ success: true, data: await state.organisations() }) }));
vi.mock("@/providers/CountProvider", () => ({ DASHBOARD_COUNTS_QUERY_KEY: ["counts"] }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useUsersData", () => ({ useUsersData: () => ({ data: state.users, isLoading: false, isFetching: false, refetch: vi.fn() }) }));
vi.mock("@/context/DataTableContext", () => ({ DataTableContainer: (props: { data: User[]; filterConfig: FilterConfig[] }) => { state.table = props; return null; } }));
vi.mock("@/components/users/UsersTableContent", () => ({ default: () => null }));

import CreateUserPage from "@/app/users/create/CreateUserPage";
import UsersOverview from "@/app/users/UsersOverview";
import { UsersTable } from "@/components/users/UsersTable";

let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  state.table = null; vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });
async function show(element: React.ReactElement) { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, element))); }
const base = { name: "Fixture", email: "fixture@example.test", createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", status: "active" as const, languagePreference: "en", isVerified: false };
const member = { id: "m", organisationId: "o", organisationName: "Fixture organisation", domain: "partner" as const, role: "viewer" as const, status: "active" as const, updatedAt: base.updatedAt };
const fixtures: User[] = [
  { ...base, id: "unassigned", domains: [], memberships: [] },
  { ...base, id: "rider", domains: ["rider"], riderStatus: "active", memberships: [] },
  ...(["partner", "advertiser", "government"] as const).map(domain => ({ ...base, id: domain, domains: [domain], memberships: [{ ...member, domain }] })),
  { ...base, id: "staff", domains: ["staff"], employeeRole: "support_agent", memberships: [] },
  { ...base, id: "multi", domains: ["rider", "partner", "staff"], riderStatus: "active", employeeRole: "support_agent", memberships: [member] },
];
describe("account classification filters and statistics", () => {
  it("keeps Account Type separate from Role and Status and preserves each filter's values", async () => {
    await show(React.createElement(UsersTable, { users: fixtures, isLoading: false }));
    const { data, filterConfig } = state.table!;
    expect(filterConfig.map(c => c.label)).toEqual(["Account Type", "Role", "Status"]);
    expect(filterConfig[0].options).toContainEqual({ value: "user", label: "Unassigned" });
    for (const [value, ids] of [["user", ["unassigned"]], ["rider", ["rider", "multi"]], ["partner", ["partner", "multi"]], ["advertiser", ["advertiser"]], ["government", ["government"]], ["staff", ["staff", "multi"]]] as const) {
      expect(applyFilters(data, { domains: [value] }, filterConfig).map(row => row.id)).toEqual(ids);
    }
    expect(applyFilters(data, { scopedRoles: ["partner:viewer"] }, filterConfig).map(row => row.id)).toEqual(["partner", "multi"]);
    expect(applyFilters(data, { status: ["inactive"] }, filterConfig)).toEqual([]);
    expect(data.find(row => row.id === "unassigned")).not.toHaveProperty("role");
  });
  it("renders Account Breakdown with the actual Rider, Organisation Users and Internal Staff counts", async () => {
    state.users = fixtures;
    await show(React.createElement(UsersOverview));
    const card = [...host.querySelectorAll('[data-slot="card"]')].find(node => node.textContent?.includes("Account Breakdown"))!;
    expect(card.textContent).toContain("Riders"); expect(card.textContent).toContain("Organisation Users"); expect(card.textContent).toContain("Internal Staff");
    expect(card.textContent).not.toContain("Relationships"); expect(card.textContent).not.toContain("MOVRR Staff");
    expect(card.textContent).toMatch(/Riders.*2/); expect(card.textContent).toMatch(/Organisation Users.*4/); expect(card.textContent).toMatch(/Internal Staff.*2/);
  });
});
async function select(value: string) {
  const control = [...host.querySelectorAll("select")].find(node => [...node.options].some(option => option.value === value));
  expect(control, `select option ${value}`).toBeDefined();
  await act(async () => { control!.value = value; control!.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function fill(name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function next() { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Next")!.click()); }
describe("actual Create User form", () => {
  it.each(["user", "rider", "partner", "advertiser", "government", "staff"])("keeps the %s creation choice and canonical role contract behind the approved labels", async domain => {
    await show(React.createElement(CreateUserPage));
    expect(host.textContent).toContain("Account Type"); expect(host.textContent).toContain("Unassigned");
    expect(host.textContent).not.toContain("User only"); expect(host.textContent).not.toContain("Create account with");
    await select(domain);
    await fill("name", "Fixture"); await fill("email", "fixture@example.test");
    if (domain === "rider") { await fill("city", "Amsterdam"); await fill("country", "NL"); }
    const org = { partner: "11111111-1111-4111-8111-111111111111", advertiser: "22222222-2222-4222-8222-222222222222", government: "33333333-3333-4333-8333-333333333333" }[domain];
    if (org) await select(org);
    else expect(state.organisations).not.toHaveBeenCalled();
    await next();
    if (org) expect(host.textContent).toContain("Organisation Role");
    if (domain === "staff") expect(host.textContent).toContain("Internal Staff Role");
    await next();
    const submit = [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Create User");
    expect(submit, "review step reached").toBeDefined();
    await act(async () => { submit!.click(); });
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ domain }));
    const payload = state.create.mock.calls[0][0] as { role?: string; organisationId?: string };
    if (domain === "user") expect(payload.role).toBeUndefined();
    else expect(payload.role).toBe(domain === "rider" ? "rider" : domain === "staff" ? "support_agent" : "viewer");
    if (org) expect(payload.organisationId).toBe(org); else expect(payload.organisationId).toBeUndefined();
  });
});
