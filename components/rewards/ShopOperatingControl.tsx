"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getShopOperatingControl, changeShopOperatingState, recordShopReadiness, type ShopOperatingStatus, type ShopReadiness } from "@/app/actions/shopOperatingControl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const criteria = [...Array.from({ length: 13 }, (_, i) => `f${i + 1}`), "digital", "qr", "supply", "integration", "device", "provider", "web"];
export function ShopOperatingControl() {
  const [status, setStatus] = useState<ShopOperatingStatus | null>(null);
  const [readiness, setReadiness] = useState<ShopReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<ShopOperatingStatus["state"] | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [criterion, setCriterion] = useState("f1");
  const [reference, setReference] = useState("");
  const [revision, setRevision] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const operation = useRef<string | null>(null);
  const viewedVersion = useRef(0);
  const evidenceVersions = useRef<Record<string, number>>({});
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getShopOperatingControl();
      if (result.data) { setStatus(result.data.status); setReadiness(result.data.readiness); setError(null); }
      else setError(result.error ?? "Operating control unavailable");
    } catch { setError("Operating control unavailable. Refresh to retry."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => { void refresh(); }, 30_000); return () => clearInterval(timer); }, [refresh]);
  async function change() {
    if (!status || !target || !reason.trim()) return;
    setPending(true); operation.current ??= crypto.randomUUID();
    try {
      const result = await changeShopOperatingState({ state: target, expectedVersion: viewedVersion.current, reason: reason.trim(), operation: operation.current });
      if (result.error) { setError(result.error); return; }
      setTarget(null); operation.current = null; await refresh();
    } catch { setError("Response unavailable. Retry the same operation or close and refresh to check its outcome."); }
    finally { setPending(false); }
  }
  async function evidence(passed: boolean) {
    if (!validUntil || !reference.trim() || !/^[a-f0-9]{40}$/.test(revision)) { setError("Provide the acceptance report reference, full revision and expiry."); return; }
    setPending(true); operation.current ??= crypto.randomUUID();
    try {
      const result = await recordShopReadiness({ criterion, passed, reference: reference.trim(), revision, validUntil: new Date(validUntil).toISOString(), expectedVersion: evidenceVersions.current[criterion] ?? 0, operation: operation.current });
      if (result.error) { setError(result.error); return; }
      setEvidenceOpen(false); operation.current = null; await refresh();
    } catch { setError("Response unavailable. Retry the same operation or refresh to check its outcome."); }
    finally { setPending(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Public Shop redemption</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {loading && !status ? <Skeleton className="h-16 w-full" /> : status && <>
        <div className="flex flex-wrap items-center gap-3"><Badge variant={status.state === "enabled" ? "default" : "secondary"}>{status.state === "hold" ? "Operational hold" : status.state === "enabled" ? "Enabled" : "Disabled"}</Badge><span className="text-sm text-muted-foreground">Changed {new Date(status.changed_at).toLocaleString()} · {status.changed_by ?? "Production containment"}</span></div>
        <p className="text-sm">{status.reason}</p>
        <p className="text-sm text-muted-foreground">New paid and free claims follow this control. Existing rewards, refunds and recovery continue.</p>
        {readiness && <div className="text-sm space-y-1"><p>{readiness.ready ? "Launch checks passed. Explicit activation is still required." : "Launch checks incomplete. Enablement is blocked."}</p><p className="text-muted-foreground">Missing or expired acceptance: {readiness.missingEvidence.join(", ") || "None"}. Supply: {readiness.inventoryReady ? "Available" : "Not ready"}. Worker: {readiness.worker?.fresh ? "Recent outcome recorded" : "No recent successful outcome"}.</p></div>}
        {!!status.evidence.length && <details className="text-sm"><summary className="cursor-pointer">Recorded acceptance evidence</summary><ul className="mt-2 space-y-2">{status.evidence.map(e => <li key={e.criterion}><span className="font-medium">{e.criterion}: {e.passed ? "Passed" : "Revoked"}</span><p className="text-muted-foreground break-words">{e.reference} · {e.revision.slice(0, 8)} · Valid until {new Date(e.valid_until).toLocaleString()}</p></li>)}</ul></details>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={loading || pending}>Refresh</Button>{status.canManage && <>
          {(["enabled", "disabled", "hold"] as const).map(state => <Button key={state} variant={state === "hold" ? "destructive" : "outline"} disabled={pending || loading || status.state === state || (state === "enabled" && (!readiness?.ready || status.state === "hold"))} onClick={() => { setReason(""); operation.current = null; viewedVersion.current = status.version; setTarget(state); }}>{state === "hold" ? "Place on hold" : state === "enabled" ? "Enable" : "Disable"}</Button>)}
          <Button variant="outline" disabled={pending} onClick={() => { operation.current = null; evidenceVersions.current = Object.fromEntries(status.evidence.map(e => [e.criterion, e.version])); setEvidenceOpen(true); }}>Review acceptance evidence</Button>
        </>}</div>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CardContent>
    <Dialog open={target !== null} onOpenChange={open => { if (!open && !pending) setTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{target === "enabled" ? "Enable public redemption?" : target === "hold" ? "Place redemption on operational hold?" : "Disable new redemptions?"}</DialogTitle><DialogDescription>{target === "enabled" ? "Eligible riders will be able to spend points and claim free rewards. The server will recheck all launch conditions." : "Existing fulfillment, refunds and recovery remain available. Record the operational reason."}</DialogDescription></DialogHeader><Label htmlFor="shop-operating-reason">Reason</Label><Textarea id="shop-operating-reason" value={reason} disabled={pending} onChange={e => { operation.current = null; setReason(e.target.value); }} maxLength={1000} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setTarget(null)}>Cancel</Button><Button disabled={pending || !reason.trim()} onClick={() => void change()}>{pending ? "Saving…" : "Confirm"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={evidenceOpen} onOpenChange={open => { if (!pending) setEvidenceOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Record verified launch acceptance</DialogTitle><DialogDescription>Attest only to checks demonstrated in the referenced report. Revoking a check places redemption on hold. Passing evidence never enables redemption.</DialogDescription></DialogHeader>
      <Label htmlFor="shop-criterion">Acceptance check</Label><Select value={criterion} disabled={pending} onValueChange={value => { operation.current = null; setCriterion(value); }}><SelectTrigger id="shop-criterion"><SelectValue /></SelectTrigger><SelectContent>{criteria.map(c => <SelectItem key={c} value={c}>{/^f\d+$/.test(c) ? `Audit finding ${c.toUpperCase()}` : c === "qr" ? "QR / barcode acceptance" : `${c[0].toUpperCase()}${c.slice(1)} acceptance`}</SelectItem>)}</SelectContent></Select>
      <Label htmlFor="shop-evidence-reference">Acceptance report reference</Label><Textarea id="shop-evidence-reference" disabled={pending} value={reference} onChange={e => { operation.current = null; setReference(e.target.value); }} />
      <Label htmlFor="shop-evidence-revision">Verified source revision (40 characters)</Label><Input id="shop-evidence-revision" disabled={pending} value={revision} onChange={e => { operation.current = null; setRevision(e.target.value); }} />
      <Label htmlFor="shop-evidence-expiry">Valid until (maximum 30 days)</Label><Input id="shop-evidence-expiry" disabled={pending} type="datetime-local" value={validUntil} onChange={e => { operation.current = null; setValidUntil(e.target.value); }} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setEvidenceOpen(false)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={() => void evidence(false)}>Revoke / Hold</Button><Button disabled={pending} onClick={() => void evidence(true)}>{pending ? "Saving…" : "Record passed check"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
