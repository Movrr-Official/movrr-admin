"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { changeDeletionIntake } from "@/app/actions/accountDeletionIntake";
import { dashboardRead } from "@/lib/dashboard/readTransport";
import { useAdminUser, useCapability } from "@/hooks/useAdminUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AccountDeletionIntakeControl() {
  const { data: actor } = useAdminUser();
  return actor?.user_id ? <IntakeForAccount key={actor.user_id} accountId={actor.user_id} role={actor.role} /> : null;
}
function IntakeForAccount({ accountId, role }: { accountId: string; role: string }) {
  const canRead = useCapability("privacy.deletion.monitor");
  const canManage = useCapability("settings.security") && ["security_admin", "super_admin"].includes(role);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"enabled" | "disabled" | "hold">("disabled");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<Parameters<typeof changeDeletionIntake>[0] | null>(null);
  const query = useQuery({ queryKey: ["deletion-intake-control", accountId], enabled: canRead, retry: false, queryFn: async () => {
    const result = await dashboardRead("deletionIntake");
    if (!result.data) throw new Error(result.error);
    return result.data;
  }});
  if (!canRead) return null;
  return <section className="space-y-3 rounded border border-border p-3" aria-label="Deletion intake operating control">
    <h3 className="font-medium">New self-service deletion requests</h3>
    <p className="text-sm">Pausing intake leaves accepted requests, retention reviews and receipts available. Privacy rights requests can also be sent to <a className="underline" href="mailto:privacy@movrr.nl">privacy@movrr.nl</a>. This control does not start irreversible processing.</p>
    {query.data && <p role="status">{query.data.state} · Version {query.data.version} · Effective intake: {query.data.requestsEnabled ? "enabled" : "disabled"}<br />{query.data.reason}</p>}
    {query.error && <p role="alert">Intake state unavailable. No change is possible.</p>}
    <Button variant="outline" disabled={busy || query.isFetching} onClick={() => { pending.current = null; void query.refetch(); }}>Refresh intake state</Button>
    {canManage && <form className="space-y-2" onSubmit={async event => {
      event.preventDefault();
      if (!query.data || busy) return;
      setBusy(true);
      const input = pending.current ?? { accountId, state, reason: reason.trim(), expectedVersion: query.data.version, operation: crypto.randomUUID() };
      pending.current = input;
      try {
        const result = await changeDeletionIntake(input);
        setMessage(result.data ? "Intake state recorded. Existing processing controls are unchanged." : result.error ?? "Change unconfirmed.");
        if (result.data) { pending.current = null; setReason(""); await query.refetch(); }
      } catch { setMessage("Change unconfirmed. Retry the same operation or refresh state."); }
      finally { setBusy(false); }
    }}>
      <div className="space-y-2">
        <Label htmlFor="deletion-intake-state">New intake state</Label>
        <Select value={state} disabled={busy || !!pending.current} onValueChange={value => setState(value as typeof state)}>
          <SelectTrigger id="deletion-intake-state" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
            <SelectItem value="enabled">Enabled (intake and receipt checks)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="deletion-intake-reason">Reason and approval reference</Label>
        <Input id="deletion-intake-reason" value={reason} required minLength={10} maxLength={1000} disabled={busy || !!pending.current} onChange={event => setReason(event.target.value)} aria-describedby="deletion-intake-help" />
      </div>
      <p id="deletion-intake-help" className="text-sm text-muted-foreground">Security administrators only. Refresh after a version conflict. Production activation requires explicit approval.</p>
      <Button type="submit" disabled={busy || !query.data || reason.trim().length < 10}>{busy ? "Recording" : pending.current ? "Retry same change" : "Record intake state"}</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
