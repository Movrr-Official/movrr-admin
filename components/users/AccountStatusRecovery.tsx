"use client";
import { useState } from "react";
import { retryAccountAuthSynchronization } from "@/app/actions/accountMemberships";
import { useCapability } from "@/hooks/useAdminUser";
import { Button } from "@/components/ui/button";

export function AccountStatusRecovery({ userId, pending, onChange }: { userId: string; pending?: boolean; onChange?: () => void }) {
  const allowed = useCapability("users.manage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!pending || !allowed) return null;
  return <div className="space-y-2"><Button type="button" variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { await retryAccountAuthSynchronization(userId); onChange?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Account activation needs retry"); }
    finally { setBusy(false); }
  }}>Retry account activation or suspension</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
