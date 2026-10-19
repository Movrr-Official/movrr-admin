"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { platformGet, platformPost } from "@/lib/platformApi/client";
import { useCapability } from "@/hooks/useAdminUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
type Case = { id: string; fulfilment_id: string; kind: "recovery" | "delivery"; attempts: number; revision: number; available_at: string; last_error: string | null; exhausted: boolean };
export function ShopExceptionQueue() {
  const [rows, setRows] = useState<Case[]>([]), [after, setAfter] = useState<string | null>(null), [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Case | null>(null), [reason, setReason] = useState(""), [error, setError] = useState<string | null>(null), [pending, setPending] = useState(false);
  const operation = useRef<string | null>(null), canRetry = useCapability("fulfilment.cancel");
  const load = useCallback(async (cursor: string | null = null) => {
    setPending(true);
    try {
      const result = await platformGet<Case[]>(`/api/v1/fulfilment/exceptions${cursor ? `?after=${cursor}` : ""}`);
      if (!result.ok) { setError(result.message); return; }
      setRows(cursor ? old => [...old, ...result.value] : result.value); setAfter(result.value.at(-1)?.id ?? null); setHasMore(result.value.length === 50); setError(null);
    } catch { setError("Exception queue unavailable. Refresh to retry."); } finally { setPending(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function retry() {
    if (!selected || !reason.trim()) return;
    setPending(true); operation.current ??= crypto.randomUUID();
    try {
      const result = await platformPost("/api/v1/fulfilment/exceptions", { headers: { "Idempotency-Key": operation.current }, body: { id: selected.id, kind: selected.kind, expectedVersion: selected.revision, reason: reason.trim() } });
      if (!result.ok) { setError(result.message); return; }
      setSelected(null); operation.current = null; await load();
    } catch { setError("Response unavailable. Retry the same operation or refresh to check its outcome."); } finally { setPending(false); }
  }
  return <Card><CardHeader><CardTitle>Recovery and delivery exceptions</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Automatic attempts stop after eight failures. Review the cause before queueing another bounded cycle. Delivery retries do not repeat fulfillment or wallet effects.</p>
    {rows.map(row => <div key={`${row.kind}:${row.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"><Link className="underline" href={`/fulfilment/queue/${row.fulfilment_id}`}>{row.fulfilment_id.slice(0, 8)}</Link><span>{row.kind} · {row.attempts} attempts · {row.exhausted ? "Needs review" : "Queued"} · {row.last_error === "validated_requires_review" ? "Review collection or cancellation" : row.last_error ?? "Awaiting attempt"}</span>{canRetry && <Button size="sm" variant="outline" disabled={pending || row.last_error === "validated_requires_review"} onClick={() => { setSelected(row); setReason(""); operation.current = null; }}>Review retry</Button>}</div>)}
    {!rows.length && <p className="text-sm text-muted-foreground">{pending ? "Loading exceptions…" : "No unresolved exceptions."}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex gap-2"><Button variant="outline" disabled={pending} onClick={() => void load()}>Refresh</Button>{hasMore && <Button variant="outline" disabled={pending} onClick={() => void load(after)}>Load more</Button>}</div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open && !pending) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Queue recovery retry?</DialogTitle><DialogDescription>Confirm that the underlying issue has been addressed. The server rejects this action if the case changed after you opened it.</DialogDescription></DialogHeader><Label htmlFor="shop-retry-reason">Reason</Label><Textarea id="shop-retry-reason" value={reason} disabled={pending} onChange={e => { operation.current = null; setReason(e.target.value); }} maxLength={1000} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setSelected(null)}>Cancel</Button><Button disabled={pending || !reason.trim()} onClick={() => void retry()}>{pending ? "Queueing…" : "Confirm retry"}</Button></DialogFooter></DialogContent></Dialog>
  </CardContent></Card>;
}
