"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { platformPost } from "@/lib/platformApi/client";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import {
  useCancelFulfilment,
  useRefundFulfilment,
} from "@/hooks/useFulfilmentOpsData";

export type FulfilmentActionKind = "cancel" | "refund" | "validate" | "collect" | "retry" | "legacy_cancel";

type FulfilmentActionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: FulfilmentActionKind | null;
  fulfilmentId: string;
  expectedVersion: number;
  legacyStatus?: "requested" | "approved";
  onConcurrencyConflict?: () => void;
  onSuccess?: () => void;
};

export function FulfilmentActionsDialog({
  open,
  onOpenChange,
  action,
  fulfilmentId,
  expectedVersion,
  legacyStatus,
  onConcurrencyConflict,
  onSuccess,
}: FulfilmentActionsDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [riderReason,setRiderReason]=useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingOperation = useRef<string | null>(null);
  const cancelMutation = useCancelFulfilment();
  const refundMutation = useRefundFulfilment();

  const isPending = submitting || cancelMutation.isPending || refundMutation.isPending;
  const title = action === "legacy_cancel" ? "Cancel historical reservation" : action === "retry" ? "Retry recovery" : action === "validate" ? "Validate reward QR" : action === "collect" ? "Confirm collection" : action === "refund" ? "Refund fulfilment" : "Cancel fulfilment";
  const description = action === "legacy_cancel" ? "Release the points reserved by this pre-launch request. Review any unrecorded historical stock movement separately in inventory management." : action === "validate" ? "Scan or paste the rider's QR value to validate this reward once."
    : action === "collect" ? "Confirm that the rider has received the reward."
    : action === "retry" ? "Queue the interrupted reward for automatic recovery and reconciliation."
    : "Cancel an undelivered reward, release its stock and return any points spent.";

  const reset = () => {
    setReason("");
    setRiderReason("");
    setToken("");
    pendingOperation.current = null;
  };

  const handleSubmit = async () => {
    if (!action) return;
    const trimmed = reason.trim() || (action === "validate" ? "partner_validation" : action === "collect" ? "collection_confirmed" : "");
    if (!trimmed) {
      toast({
        title: "Reason required",
        description: "Provide a reason for the ops action.",
        variant: "destructive",
      });
      return;
    }

    const mutate =
      action === "refund" ? refundMutation.mutateAsync : cancelMutation.mutateAsync;

    try {
      setSubmitting(true);
      if (action === "validate" || action === "collect" || action === "retry" || action === "legacy_cancel") {
        const operationKey = `shop.ops:${fulfilmentId}:${action}:${expectedVersion}`;
        pendingOperation.current ??= sessionStorage.getItem(operationKey) ?? crypto.randomUUID();
        sessionStorage.setItem(operationKey, pendingOperation.current);
        const path = action === "legacy_cancel" ? `/api/v1/rewards/redemptions/${encodeURIComponent(fulfilmentId)}/cancel`
          : `/api/v1/fulfilment/${action === "validate" ? "tokens/consume" : `${encodeURIComponent(fulfilmentId)}/${action === "retry" ? "retry" : "confirm-collection"}`}`;
        const result = await platformPost(path, { headers: { "Idempotency-Key": pendingOperation.current }, body: { reason: trimmed, expectedVersion, ...(action === "legacy_cancel" ? { expectedStatus: legacyStatus } : {}), ...(action === "validate" ? { token: token.trim(), fulfilmentId } : {}) } });
        if (!result.ok) throw Object.assign(new Error(result.message), { kind: result.kind });
        sessionStorage.removeItem(operationKey);
      } else await mutate({
        id: fulfilmentId,
        reason: trimmed,
        ...(riderReason.trim()?{riderReason:riderReason.trim()}:{}),
        expectedVersion,
      });
      toast({
        title: action === "validate" ? "Reward validated" : action === "collect" ? "Collection confirmed" : action === "retry" ? "Recovery queued" : "Reward cancelled",
        description: "Platform API accepted the command.",
      });
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      const err = error as Error & { kind?: string };
      if (err.kind === "ConcurrencyConflict") {
        toast({
          title: "State changed",
          description:
            "This fulfilment was updated elsewhere. Reloading the latest version.",
          variant: "destructive",
        });
        onConcurrencyConflict?.();
        onOpenChange(false);
        reset();
        return;
      }
      toast({
        title: "Action failed",
        description: err.message || "Platform API request failed",
        variant: "destructive",
      });
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog
      open={open && Boolean(action)}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(action==="cancel"||action==="refund") && <div className="space-y-2"><Label htmlFor="rider-cancellation-reason">Reason shown to the rider (optional)</Label><Textarea id="rider-cancellation-reason" maxLength={1000} value={riderReason} onChange={event=>setRiderReason(event.target.value)} placeholder="Rider-safe explanation; internal audit notes remain separate."/></div>}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground font-mono">
            id={fulfilmentId} · expectedVersion={expectedVersion}
          </div>
          {action === "validate" && <div className="space-y-2"><Label htmlFor="reward-credential">Scanned QR value</Label><Input id="reward-credential" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} /></div>}
          <div className="space-y-2">
            <Label htmlFor="fulfilment-action-reason">Reason</Label>
            <Textarea
              id="fulfilment-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Operator reason (sent to Platform API)"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Close
          </Button>
          <Button
            type="button"
            variant={action === "refund" ? "default" : "destructive"}
            onClick={() => void handleSubmit()}
            disabled={isPending}
          >
            {isPending
              ? "Submitting…"
              : action === "refund"
                ? "Confirm refund"
                : action === "legacy_cancel" ? "Release reservation" : action === "retry" ? "Queue recovery" : action === "validate" ? "Validate QR" : action === "collect" ? "Confirm collection" : "Confirm cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
