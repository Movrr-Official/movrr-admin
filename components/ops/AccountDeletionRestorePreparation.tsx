"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prepareAccountDeletionRestoreRecovery } from "@/app/actions/accountDeletionRecovery";

/** Mounted only inside the existing Security-capable operational surface. */
export function AccountDeletionRestorePreparation({ onPrepared }: { onPrepared: () => Promise<unknown> }) {
  const [userId, setUserId] = useState("");
  const [artifact, setArtifact] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function prepare() {
    setBusy(true);
    try {
      let value: unknown;
      try { value = JSON.parse(artifact); } catch { setMessage("Enter a valid signed suppression artifact."); return; }
      const result = await prepareAccountDeletionRestoreRecovery(userId.trim(), value);
      if (!result.success) { setMessage(result.error); return; }
      setArtifact(""); setUserId("");
      setMessage(`Restored subject restricted. Request ${result.data.requestId} requires independent Security review before the existing worker may erase it. Public access remains quarantined.`);
      await onPrepared();
    } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded border border-border p-3 text-sm">
    <p className="font-medium">Quarantined backup recovery</p>
    <p className="text-muted-foreground">Use verified previous-erasure evidence for an actually restored identity. This action restricts access and creates a review request. It does not release the restored environment.</p>
    <Input aria-label="Restored identity reference" placeholder="Restored Supabase user reference" value={userId} onChange={event => setUserId(event.target.value)} maxLength={36} />
    <Textarea aria-label="Signed suppression artifact" placeholder="Signed hash-only suppression artifact" value={artifact} onChange={event => setArtifact(event.target.value)} maxLength={4_000_000} />
    <Button size="sm" variant="outline" disabled={busy || !userId.trim() || !artifact.trim()} onClick={() => void prepare()}>Restrict restored subject for review</Button>
    {message && <p role="status">{message}</p>}
  </div>;
}
