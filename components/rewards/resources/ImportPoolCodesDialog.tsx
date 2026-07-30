"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useImportPoolCodes } from "@/hooks/useResourcePoolsData";

type ImportPoolCodesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill resource id when importing from a selected pool. */
  defaultResourceId?: string | null;
};

function parseCodes(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((code) => code.trim())
    .filter(Boolean);
}

export function ImportPoolCodesDialog({
  open,
  onOpenChange,
  defaultResourceId = null,
}: ImportPoolCodesDialogProps) {
  const { toast } = useToast();
  const importMutation = useImportPoolCodes();
  const [resourceId, setResourceId] = useState("");
  const [codesText, setCodesText] = useState("");

  const reset = () => {
    setResourceId("");
    setCodesText("");
  };

  useEffect(() => {
    if (!open) return;
    setResourceId(defaultResourceId?.trim() ?? "");
  }, [open, defaultResourceId]);

  const handleSubmit = async () => {
    const id = resourceId.trim();
    const codes = parseCodes(codesText);
    if (!id) {
      toast({
        title: "Resource ID required",
        description: "Provide the pool resourceId from Platform API.",
        variant: "destructive",
      });
      return;
    }
    if (codes.length === 0) {
      toast({
        title: "Codes required",
        description: "Paste one or more voucher codes (newline or comma separated).",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await importMutation.mutateAsync({
        resourceId: id,
        codes,
      });
      toast({
        title: "Import accepted",
        description: `Platform API accepted ${result.imported} code(s) for ${result.resourceId}.`,
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Import failed",
        description:
          error instanceof Error ? error.message : "Platform API request failed",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import pool codes</DialogTitle>
          <DialogDescription>
            Posts codes to `/api/v1/partners/resources` with an Idempotency-Key.
            No client-side pool logic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pool-resource-id">Resource ID</Label>
            <Input
              id="pool-resource-id"
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
              placeholder="resource uuid"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pool-codes">Codes (CSV or one per line)</Label>
            <Textarea
              id="pool-codes"
              value={codesText}
              onChange={(event) => setCodesText(event.target.value)}
              rows={6}
              placeholder={"CODE-001\nCODE-002"}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importMutation.isPending}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending ? "Importing…" : "Import codes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
