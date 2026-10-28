"use client";
import { useEffect, useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { getAccountAccess, sendAccountAccess } from "@/app/actions/accountAccess";
import { accessAction, type AccountAccessState } from "@/features/identity/domain/accountAccess";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";
const deliveryLabel = (state: string) => ({ accepted: "Provider accepted; delivery unconfirmed", delivered: "Delivered to receiving mail server",
  unknown: "Submission outcome unknown; review before retrying", not_recorded: "Not recorded", failed: "Failed", bounced: "Bounced",
  complained: "Spam complaint", delivery_delayed: "Delivery delayed", suppressed: "Suppressed" }[state] ?? state);

export function AccountAccess({ userId }: { userId: string }) {
  const [state, setState] = useState<AccountAccessState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  async function load() {
    const result = await getAccountAccess(userId);
    if (result.success) setState(result.data); else setError(result.error);
  }
  useEffect(() => {
    let active = true;
    setState(null); setError(""); setMessage(""); setConfirm(null);
    getAccountAccess(userId).then(result => {
      if (!active) return;
      if (result.success) setState(result.data); else setError(result.error);
    }).catch(() => { if (active) setError("Unable to load account access. Try again."); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [userId]);
  return <Card className="border-border">
    <CardHeader className="pb-4"><CardTitle className="text-lg font-bold">Account Access</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {!state && !error && <p role="status" className="text-sm text-muted-foreground">Loading account access…</p>}
      {state && <>
        {state.recoveryEnabled === false && <p className="text-sm text-muted-foreground">Recovery is disabled pending verification of the production Auth email expiry policy.</p>}
        <p className="text-sm text-muted-foreground">Password credential: {state.hasPassword ? "Present" : "Not configured"}. Setup completion: {state.lastSignInAt ? `Sign-in recorded ${date(state.lastSignInAt)}` : "Not confirmed"}.</p>
        {!state.eligible && <p className="text-sm text-muted-foreground">Account is inactive, suspended, or deleted. Access emails are disabled.</p>}
        {state.memberships.map(member => {
          const action = accessAction(state, member);
          const seconds = member.retryAt ? Math.max(0, Math.ceil((Date.parse(member.retryAt) - now) / 1000)) : 0;
          return <div key={member.organisationId} className="space-y-2 border-t border-border pt-3 text-sm">
            <p className="font-semibold">{member.organisationName}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
              <dt>Invitation</dt><dd>{member.invitationStatus ?? "Not recorded"}</dd>
              <dt>Membership</dt><dd>{member.membershipStatus}</dd>
              <dt>Last email attempt</dt><dd>{date(member.lastAttemptAt)}</dd>
              <dt>Invitation expires</dt><dd>{date(member.invitationExpiresAt)}</dd>
              <dt>Email delivery</dt><dd>{deliveryLabel(member.deliveryState)}</dd>
            </dl>
            {action ? confirm === member.organisationId ? <div className="space-y-2">
              <p>Send an access email for {member.organisationName}? Prior setup links may be superseded. The current password and role stay unchanged.</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button>
                <Button type="button" size="sm" disabled={busy || seconds > 0} onClick={async () => {
                  setBusy(true); setError(""); setMessage("");
                  try {
                    const result = await sendAccountAccess(userId, member.organisationId);
                    if (result.success) { setMessage("Provider accepted the email. Delivery is not yet confirmed."); setConfirm(null); }
                    else setError(result.error);
                    await load();
                  } catch { setError("Result could not be confirmed. Refresh account access before retrying."); }
                  finally { setBusy(false); }
                }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm {action}</Button>
              </div>
            </div> : <Button type="button" variant="outline" size="sm" disabled={busy || seconds > 0} onClick={() => setConfirm(member.organisationId)}>
              <KeyRound className="mr-2 h-4 w-4" />{seconds > 0 ? `Retry in ${seconds}s` : action}
            </Button> : <p className="text-muted-foreground">Recovery is unavailable for this membership or your employee permissions.</p>}
          </div>;
        })}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setError(""); load().catch(() => setError("Unable to refresh account access.")); }}>Refresh account access</Button>
    </CardContent>
  </Card>;
}
