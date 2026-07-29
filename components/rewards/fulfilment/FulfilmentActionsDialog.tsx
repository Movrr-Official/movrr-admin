"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import {
  useCancelFulfilment,
  useRefundFulfilment,
} from "@/hooks/useFulfilmentOpsData";

export type FulfilmentActionKind = "cancel" | "refund";

type FulfilmentActionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: FulfilmentActionKind | null;
  fulfilmentId: string;
  expectedVersion: number;
  onConcurrencyConflict?: () => void;
  onSuccess?: () => void;
};

export function FulfilmentActionsDialog({
  open,
  onOpenChange,
  action,
  fulfilmentId,
  expectedVersion,
  onConcurrencyConflict,
  onSuccess,
}: FulfilmentActionsDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const cancelMutation = useCancelFulfilment();
  const refundMutation = useRefundFulfilment();

  const isPending = cancelMutation.isPending || refundMutation.isPending;
  const title = action === "refund" ? "Refund fulfilment" : "Cancel fulfilment";
  const description =
    action === "refund"
      ? "Sends a refund command through the Platform API with the current aggregate version."
      : "Sends a cancel command through the Platform API with the current aggregate version.";

  const reset = () => {
    setReason("");
  };

  const handleSubmit = async () => {
    if (!action) return;
    const trimmed = reason.trim();
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
      await mutate({
        id: fulfilmentId,
        reason: trimmed,
        expectedVersion,
      });
      toast({
        title: action === "refund" ? "Refund submitted" : "Cancel submitted",
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
    }
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
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground font-mono">
            id={fulfilmentId} · expectedVersion={expectedVersion}
          </div>
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
                : "Confirm cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
