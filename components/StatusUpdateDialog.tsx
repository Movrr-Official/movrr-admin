"use client";

import { CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface StatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    id: string;
    name: string;
    email: string;
    status: "pending" | "approved" | "rejected";
  } | null;
  onStatusUpdate: (
    id: string,
    newStatus: "pending" | "approved" | "rejected",
    reason?: string
  ) => void;
}

export function StatusUpdateDialog({
  open,
  onOpenChange,
  entry,
  onStatusUpdate,
}: StatusUpdateDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<
    "pending" | "approved" | "rejected" | null
  >(null);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!entry) return null;

  const handleConfirm = async () => {
    if (!selectedStatus || !entry) return;

    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      onStatusUpdate(entry.id, selectedStatus, reason);
      setSelectedStatus(null);
      setReason("");
      onOpenChange(false);
    } catch (error) {
      // Error is handled by parent component
      console.error("Dialog confirmation error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const statusOptions = [
    {
      value: "pending" as const,
      label: "Pending",
      icon: Clock,
      color:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      value: "approved" as const,
      label: "Approve",
      icon: CheckCircle,
      color:
        "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300",
    },
    {
      value: "rejected" as const,
      label: "Reject",
      icon: XCircle,
      color:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] glass-card border-border/30">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Update Status</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Updating status for{" "}
            <span className="font-semibold text-foreground">{entry.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Status */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Current Status</Label>
            <div className="text-sm text-muted-foreground capitalize bg-muted/30 rounded-lg p-3 border border-border/50">
              {entry.status}
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">New Status</Label>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedStatus(option.value)}
                    className={`p-3 rounded-lg border-2 transition-all text-center space-y-1 ${
                      selectedStatus === option.value
                        ? `${option.color} border-current`
                        : "border-border/50 hover:border-border text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5 mx-auto" />
                    <div className="text-xs font-semibold">{option.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-semibold">
              Reason (Optional)
            </Label>
            <Textarea
              id="reason"
              placeholder="Add a note about this status change (e.g., 'Lacks bike ownership', 'Verification complete', etc.)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-24 resize-none bg-background/50 border-border/50 focus:border-primary/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedStatus(null);
              setReason("");
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedStatus || isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
