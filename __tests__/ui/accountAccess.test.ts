// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ load: vi.fn(), send: vi.fn() }));
vi.mock("@/app/actions/accountAccess", () => ({ getAccountAccess: s.load, sendAccountAccess: s.send }));
import { AccountAccess } from "@/components/users/AccountAccess";
let root: Root, host: HTMLDivElement;
const state = { userId: "synthetic", eligible: true, recoveryEnabled: true, hasPassword: true, lastSignInAt: null,
  memberships: [{ organisationId: "synthetic-org", organisationName: "Synthetic Org", membershipStatus: "invited", invitationStatus: "expired",
    invitationExpiresAt: "2026-01-01T00:00:00Z", lastAttemptAt: null, deliveryState: "accepted", retryAt: null, canSend: true }] };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  s.load.mockReset().mockResolvedValue({ success: true, data: state }); s.send.mockReset().mockResolvedValue({ success: true, data: null });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.includes(label))!;
it("shows truthful delivery and credential state and requires confirmation before resending", async () => {
  await act(async () => root.render(React.createElement(AccountAccess, { userId: "synthetic" })));
  expect(host.textContent).toContain("Password credential: Present. Setup completion: Not confirmed");
  expect(host.textContent).toContain("Provider accepted; delivery unconfirmed");
  await act(async () => button("Resend Invitation").click()); expect(s.send).not.toHaveBeenCalled();
  await act(async () => button("Confirm Resend Invitation").click());
  expect(s.send).toHaveBeenCalledWith("synthetic", "synthetic-org");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Delivery is not yet confirmed");
});
it("disables cooldown actions and offers refresh after errors", async () => {
  s.load.mockResolvedValue({ success: true, data: { ...state, memberships: [{ ...state.memberships[0], retryAt: new Date(Date.now()+300000).toISOString() }] } });
  await act(async () => root.render(React.createElement(AccountAccess, { userId: "synthetic" })));
  expect(button("Retry in").disabled).toBe(true); expect(s.send).not.toHaveBeenCalled();
  s.load.mockResolvedValue({ success: false, error: "Reload failed" });
  await act(async () => button("Refresh account access").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Reload failed");
});
it("keeps recovery unavailable while production Auth policy is unverified", async () => {
  s.load.mockResolvedValue({ success: true, data: { ...state, recoveryEnabled: false, memberships: [{ ...state.memberships[0], canSend: false }] } });
  await act(async () => root.render(React.createElement(AccountAccess, { userId: "synthetic" })));
  expect(host.textContent).toContain("Recovery is disabled pending verification"); expect(button("Resend Invitation")).toBeUndefined();
});
