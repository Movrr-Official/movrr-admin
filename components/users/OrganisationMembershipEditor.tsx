"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getAccountMemberships, getAccountOrganisations, changeAccountMembership, issueAccountInvitation, getAccountInvitations, revokeAccountInvitation } from "@/app/actions/accountMemberships";
import { rolesForDomain, accountRoleLabel, type AccountDomain } from "@/features/identity/domain/accountDomains";
import type { AccountMembership } from "@/features/identity/domain/membershipManagement";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCapability } from "@/hooks/useAdminUser";
import { Input } from "@/components/ui/input";

type Organisation = { id: string; name: string; type: string; status: string };
type Invitation = { id: string; target_entity_id: string; role: string; status: string; expires_at: string };
/** Mounted only within the existing Edit User workflow. No View-mode effects. */
export function OrganisationMembershipEditor({ userId, onChange, onBusyChange, accessRecoveryInDrawer = false }: { userId: string; onChange?: () => void; onBusyChange?: (busy: boolean) => void; accessRecoveryInDrawer?: boolean }) {
  const [memberships, setMemberships] = useState<AccountMembership[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { role: string; version: string }>>({});
  const [organisationId, setOrganisationId] = useState("");
  const [role, setRole] = useState("viewer");
  const canAssign = useCapability("users.role.assign"), canApprove = useCapability("users.role.approve");
  const canManage = canAssign || canApprove;
  const canGrant = (next: string, prior?: AccountMembership) => next === "owner" || prior?.role === "owner" ? canApprove : canAssign;
  const [showAdd, setShowAdd] = useState(false), [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [ready, setReady] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]), [invitationUrl, setInvitationUrl] = useState("");
  const invitationTokens = useRef(new Map<string, string>());
  const currentUser = useRef(userId); currentUser.current = userId;
  const reload = useCallback(async () => {
    setLoading(true); setReady(false);
    try {
      const result = await getAccountMemberships(userId);
      if (!result.success) { setError(result.error.message); return false; }
      let invites: Invitation[] = [];
      if (result.data.some(member => member.status === "invited")) {
        const invitationResult = await getAccountInvitations(userId);
        if (!invitationResult.success) { setError(invitationResult.error.message); return false; }
        invites = invitationResult.data;
      }
      if (currentUser.current !== userId) return false;
      setMemberships(result.data);
      setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id, draft]) => result.data.some(member => member.id === id && member.updatedAt === draft.version && member.role !== draft.role))));
      setInvitations(invites); setReady(true); return true;
    } catch { setError("Unable to refresh organisation memberships. Reload and try again."); return false; }
    finally { if (currentUser.current === userId) setLoading(false); }
  }, [userId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { onBusyChange?.(busy || loading); }, [busy, loading, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    if (!showAdd || !canManage) return;
    let cancelled = false;
    getAccountOrganisations().then(result => {
      if (cancelled) return;
      if (result.success) setOrganisations(result.data); else setError(result.error.message);
    }).catch(() => { if (!cancelled) setError("Unable to load organisations. Reload and try again."); });
    return () => { cancelled = true; };
  }, [showAdd, canManage]);
  async function save(orgId: string, nextRole: string, status: "active" | "invited" | "revoked", current?: AccountMembership) {
    setBusy(true); setError(""); setNotice(""); setInvitationUrl("");
    try {
      const result = await changeAccountMembership({ userId, organisationId: orgId, role: nextRole as AccountMembership["role"], status, expectedUpdatedAt: current?.updatedAt ?? null });
      if (!result.success) {
        if (result.error.code === "conflict" || result.error.code === "last_owner") await reload();
        if (result.error.code === "unavailable") setReady(false);
        setError(result.error.message); return;
      }
      setNotice(status === "revoked" ? "Organisation membership revoked." : "Organisation assignment saved.");
      if (status === "revoked") setShowHistory(true);
      setShowAdd(false); await onChange?.();
      if (!(await reload())) setError("The membership change was saved, but its latest details could not be loaded. Reload to confirm the current view.");
      else if (result.warning) setError(result.warning);
    } catch { setError("The request was interrupted. Reload to check whether the membership changed before retrying."); setReady(false); }
    finally { setBusy(false); }
  }
  async function invite(orgId: string, nextRole: string, current?: AccountMembership) {
    setBusy(true); setError(""); setNotice(""); setInvitationUrl("");
    try {
      const key = `${userId}:${orgId}:${nextRole}:${current?.updatedAt ?? "new"}`;
      let token = invitationTokens.current.get(key);
      if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join(""); invitationTokens.current.set(key, token); }
      const result = await issueAccountInvitation({ userId, organisationId: orgId, role: nextRole as AccountMembership["role"], expectedUpdatedAt: current?.updatedAt ?? null }, token);
      if (!result.success) { setError(result.error.message); return; }
      setInvitationUrl(result.data.url); setNotice("Organisation invitation created."); setShowAdd(false); await onChange?.();
      if (!(await reload())) setError("The invitation was created, but its latest details could not be loaded. Reload before making another change.");
      else if (result.warning) setError(result.warning);
    } catch { setError("The request was interrupted. Reload to check the invitation before retrying."); setReady(false); }
    finally { setBusy(false); }
  }
  const selectedDomain: AccountDomain = organisations.find(org => org.id === organisationId)?.type === "government" ? "government" : organisations.find(org => org.id === organisationId)?.type === "advertiser" ? "advertiser" : "partner";
  return <section aria-label="Organisation Memberships" className="space-y-4">
    <h3 className="text-sm font-semibold">Organisation Memberships</h3>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading organisation memberships…</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" disabled={busy || loading} onClick={() => { setError(""); void reload(); }}>Reload memberships</Button></div>}
    {ready && <>
    {canManage && !showAdd && <Button type="button" variant="outline" disabled={busy} onClick={() => { setOrganisationId(""); setRole(canAssign ? "viewer" : "owner"); setShowAdd(true); }}>Assign to Organisation</Button>}
    {memberships.some(member => member.status === "revoked") && <Button type="button" variant="ghost" aria-expanded={showHistory} disabled={busy} onClick={() => setShowHistory(value => !value)}>Access History</Button>}
    {invitationUrl && <div className="space-y-2"><Label>Invitation link · expires in 7 days</Label><Input readOnly value={invitationUrl} onFocus={event => event.target.select()} /></div>}
    {memberships.filter(member => showHistory || member.status !== "revoked").map(member => {
      const authorized = canManage && (member.role !== "owner" || canApprove);
      const protectedOwner = member.isLastActiveOwner;
      const draft = drafts[member.id]?.role ?? member.role;
      return <div key={member.id} className="space-y-3 rounded-xl border border-border/50 bg-background/60 p-4">
      <p className="text-sm font-medium">{member.organisationName} · {accountRoleLabel(member.domain, member.role)}{member.status !== "active" ? ` · ${member.status === "invited" ? "Invited" : "Revoked"}` : ""}</p>
      {authorized && <>
        <Label>Organisation Role</Label>
        <Select disabled={busy || protectedOwner || member.status === "revoked"} value={draft} onValueChange={value => { if (value) setDrafts(previous => ({ ...previous, [member.id]: { role: value, version: member.updatedAt } })); }}>
          <SelectTrigger className="rounded-xl border-border/50 bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{rolesForDomain(member.domain).filter(value => value !== "owner" || canApprove).map(value => <SelectItem key={value} value={value} disabled={!canGrant(value, member)}>{accountRoleLabel(member.domain, value)}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || protectedOwner || member.status === "revoked" || draft === member.role || !canGrant(draft, member)} onClick={() => void save(member.organisationId, draft, member.status === "invited" ? "invited" : "active", member)}>Save Assignment</Button>
          {canGrant(member.role, member) && <Button type="button" variant="outline" disabled={busy || protectedOwner} onClick={() => void save(member.organisationId, member.role, member.status === "revoked" ? "active" : "revoked", member)}>{member.status === "revoked" ? "Restore membership" : "Revoke membership"}</Button>}
        </div>
        {protectedOwner && <p className="text-xs text-muted-foreground">Cannot remove the last active organisation Owner. Assign another active Owner first.</p>}
        {!accessRecoveryInDrawer && canGrant(member.role, member) && member.status === "invited" && !invitations.some(invitation => invitation.target_entity_id === member.organisationId && invitation.status === "pending") && <Button type="button" variant="outline" disabled={busy} onClick={() => void invite(member.organisationId, member.role, member)}>Create invitation link</Button>}
        {invitations.filter(invitation => canGrant(member.role, member) && invitation.target_entity_id === member.organisationId && invitation.status === "pending").map(invitation => <Button key={invitation.id} type="button" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); setError(""); setNotice("");
          try {
            const result = await revokeAccountInvitation(invitation.id);
            if (!result.success) { setError(result.error.message); return; }
            setInvitationUrl(""); setNotice("Organisation invitation revoked."); await onChange?.();
            if (!(await reload())) setError("The invitation was revoked, but its latest details could not be loaded. Reload to confirm the current view.");
            else if (result.warning) setError(result.warning);
          } catch { setError("The request was interrupted. Reload to check the invitation before retrying."); setReady(false); }
          finally { setBusy(false); }
        }}>Revoke invitation</Button>)}
      </>}
      </div>;
    })}
    {showAdd && canManage && <div className="space-y-3 rounded-xl border border-border/50 bg-background/60 p-4">
      <Label>Organisation</Label>
      <Select value={organisationId} onValueChange={value => { setOrganisationId(value); setRole(canAssign ? "viewer" : "owner"); }} disabled={busy}>
        <SelectTrigger className="rounded-xl border-border/50 bg-background/60"><SelectValue placeholder="Select organisation" /></SelectTrigger><SelectContent>{organisations.filter(org => !memberships.some(member => member.organisationId === org.id)).map(org => <SelectItem key={org.id} value={org.id}>{org.name} · {org.type === "reward_partner" ? "Partner" : org.type === "government" ? "Government" : "Advertiser"}</SelectItem>)}</SelectContent>
      </Select>
      <Label>Organisation Role</Label>
      <Select value={role} onValueChange={setRole} disabled={busy || !organisationId}>
        <SelectTrigger className="rounded-xl border-border/50 bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{rolesForDomain(selectedDomain).filter(value => canGrant(value)).map(value => <SelectItem key={value} value={value}>{accountRoleLabel(selectedDomain, value)}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" disabled={busy || !organisationId} onClick={() => void save(organisationId, role, "active")}>Save Assignment</Button>
      <Button type="button" variant="outline" disabled={busy || !organisationId} onClick={() => void invite(organisationId, role)}>Invite to organisation</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setShowAdd(false)}>Cancel assignment</Button>
    </div>}
    </>}
  </section>;
}
