"use client";
import { useEffect, useState, useRef } from "react";
import { getAccountMemberships, getAccountOrganisations, changeAccountMembership, issueAccountInvitation, getAccountInvitations, revokeAccountInvitation, retryAccountAuthSynchronization } from "@/app/actions/accountMemberships";
import { MEMBERSHIP_ROLES, rolesForDomain, accountRoleLabel, type AccountDomain } from "@/features/identity/domain/accountDomains";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Membership = Awaited<ReturnType<typeof getAccountMemberships>>[number];
export function AccountMemberships({ userId, onChange }: { userId: string; onChange?: () => void }) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organisations, setOrganisations] = useState<Awaited<ReturnType<typeof getAccountOrganisations>>>([]);
  const [organisationId, setOrganisationId] = useState("");
  const [role, setRole] = useState<(typeof MEMBERSHIP_ROLES)[number]>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitations, setInvitations] = useState<Awaited<ReturnType<typeof getAccountInvitations>>>([]);
  const [invitationUrl, setInvitationUrl] = useState("");
  const invitationTokens = useRef(new Map<string, string>());
  const reload = async () => { setMemberships(await getAccountMemberships(userId)); setInvitations(await getAccountInvitations(userId)); };
  useEffect(() => {
    let cancelled = false;
    Promise.all([getAccountMemberships(userId), getAccountOrganisations(), getAccountInvitations(userId)]).then(([rows, orgs, invites]) => {
      if (!cancelled) { setMemberships(rows); setOrganisations(orgs); setInvitations(invites); setInvitationUrl(""); }
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [userId]);
  async function save(orgId: string, nextRole: string, status: "active" | "invited" | "revoked", current?: Membership) {
    setBusy(true); setError("");
    try {
      await changeAccountMembership({ userId, organisationId: orgId,
        role: nextRole as typeof role, status, expectedUpdatedAt: current?.updatedAt ?? null });
      await reload(); onChange?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Membership update failed"); }
    finally { setBusy(false); }
  }
  async function invite(orgId: string, nextRole: string, current?: Membership) {
    setBusy(true); setError(""); setInvitationUrl("");
    try {
      const key = `${userId}:${orgId}:${nextRole}:${current?.updatedAt ?? "new"}`;
      let token = invitationTokens.current.get(key);
      if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join(""); invitationTokens.current.set(key, token); }
      const result = await issueAccountInvitation({ userId, organisationId: orgId, role: nextRole as typeof role, expectedUpdatedAt: current?.updatedAt ?? null }, token);
      setInvitationUrl(result.url); await reload(); onChange?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Invitation failed"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <div><h3 className="font-semibold">Organisation memberships</h3>
      <p className="text-sm text-muted-foreground">Each role applies only to its named organisation. Rider and internal staff access are managed separately.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await retryAccountAuthSynchronization(userId); onChange?.(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Synchronization failed"); }
      finally { setBusy(false); }
    }}>Retry pending account activation or suspension</Button>
    {invitationUrl && <div className="space-y-2"><Label>Invitation link · expires in 7 days</Label><Input readOnly value={invitationUrl} onFocus={event => event.target.select()} /><p className="text-xs text-muted-foreground">Share with the invited account holder. This link requires their verified sign-in.</p></div>}
    {memberships.map(member => <div key={member.id} className="rounded-xl border p-4 space-y-3">
      <p className="font-medium">{member.organisationName} · {member.domain} · {member.status}</p>
      <Label>Scoped role</Label>
      <Select disabled={busy || member.status === "revoked"} value={member.role}
        onValueChange={value => void save(member.organisationId, value, member.status as "active" | "invited", member)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rolesForDomain(member.domain as AccountDomain).map(value =>
          <SelectItem key={value} value={value}>{accountRoleLabel(member.domain as AccountDomain, value)}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void save(member.organisationId, member.role, member.status === "revoked" ? "active" : "revoked", member)}>
        {member.status === "revoked" ? "Restore membership" : "Revoke membership"}
      </Button>
      {member.status === "invited" && !invitations.some(invitation => invitation.target_entity_id === member.organisationId && invitation.status === "pending") &&
        <Button type="button" variant="outline" disabled={busy} onClick={() => void invite(member.organisationId, member.role, member)}>Create invitation link</Button>}
      {invitations.filter(invitation => invitation.target_entity_id === member.organisationId && invitation.status === "pending").map(invitation =>
        <Button key={invitation.id} type="button" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await revokeAccountInvitation(invitation.id); setInvitationUrl(""); await reload(); onChange?.(); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Revocation failed"); }
          finally { setBusy(false); }
        }}>Revoke invitation</Button>)}
    </div>)}
    <div className="rounded-xl border p-4 space-y-3">
      <Label>Add an explicit membership</Label>
      <Select value={organisationId} onValueChange={setOrganisationId} disabled={busy}>
        <SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger>
        <SelectContent>{organisations.filter(org => !memberships.some(member => member.organisationId === org.id)).map(org =>
          <SelectItem key={org.id} value={org.id}>{org.name} · {org.type === "reward_partner" ? "Partner" : org.type}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={role} onValueChange={value => setRole(value as typeof role)} disabled={busy}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rolesForDomain((organisations.find(org => org.id === organisationId)?.type === "government" ? "government" : organisations.find(org => org.id === organisationId)?.type === "advertiser" ? "advertiser" : "partner")).map(value =>
          <SelectItem key={value} value={value}>{accountRoleLabel((organisations.find(org => org.id === organisationId)?.type === "reward_partner" ? "partner" : "advertiser"), value)}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" disabled={busy || !organisationId} onClick={() => void save(organisationId, role, "active")}>Save membership</Button>
      <Button type="button" variant="outline" disabled={busy || !organisationId} onClick={() => void invite(organisationId, role)}>Invite to organisation</Button>
    </div>
  </div>;
}
