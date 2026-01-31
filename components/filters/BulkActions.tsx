"use client";

import { useState } from "react";
import { Loader2, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: (selectedRows: any[]) => Promise<void> | void;
  variant?: "default" | "destructive" | "outline";
  confirmation?: {
    title: string;
    description: string | ((count: number) => string);
  };
  disabled?: boolean;
}

interface BulkActionsProps {
  selectedRows: any[];
  actions: BulkAction[];
  entityName?: string; // e.g., "user", "campaign" - will be pluralized
  onSuccess?: () => void;
  className?: string;
}

export function BulkActions({
  selectedRows,
  actions,
  entityName = "item",
  onSuccess,
  className,
}: BulkActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState<string | null>(null);

  if (selectedRows.length === 0) return null;

  const entityNamePlural = selectedRows.length === 1 ? entityName : `${entityName}s`;

  const handleAction = async (action: BulkAction) => {
    if (action.confirmation) {
      setShowDialog(action.label);
      return;
    }

    setIsLoading(action.label);
    try {
      await action.onClick(selectedRows);
      onSuccess?.();
    } catch (error) {
      console.error("Bulk action error:", error);
      // Error handling is done in the action's onClick handler
      // This catch is just to prevent unhandled promise rejections
    } finally {
      setIsLoading(null);
    }
  };

  const confirmAction = async (action: BulkAction) => {
    setShowDialog(null);
    setIsLoading(action.label);
    try {
      await action.onClick(selectedRows);
      onSuccess?.();
    } catch (error) {
      console.error("Bulk action error:", error);
      // Error handling is done in the action's onClick handler
      // This catch is just to prevent unhandled promise rejections
    } finally {
      setIsLoading(null);
    }
  };

  const currentAction = actions.find((a) => a.label === showDialog);

  return (
    <>
      <div
        className={`flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20 ${className || ""}`}
      >
        <span className="text-sm font-semibold text-foreground">
          {selectedRows.length} {entityNamePlural} selected
        </span>
        <div className="flex gap-2 ml-auto">
          {actions.map((action) => {
            const Icon = action.icon;
            const isActionLoading = isLoading === action.label;
            const isDisabled = action.disabled || isActionLoading;

            return (
              <Button
                key={action.label}
                variant={action.variant || "outline"}
                size="sm"
                onClick={() => handleAction(action)}
                disabled={isDisabled}
              >
                {isActionLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon className="mr-2 h-4 w-4" />
                    {action.label}
                  </>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialogs */}
      {currentAction && currentAction.confirmation && (
        <AlertDialog open={showDialog !== null} onOpenChange={(open) => !open && setShowDialog(null)}>
          <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{currentAction.confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {typeof currentAction.confirmation.description === "function"
                  ? currentAction.confirmation.description(selectedRows.length)
                  : currentAction.confirmation.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoading !== null}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmAction(currentAction)}
                disabled={isLoading !== null}
                className={
                  currentAction.variant === "destructive"
                    ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }
              >
                {isLoading === currentAction.label && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isLoading === currentAction.label
                  ? "Processing..."
                  : currentAction.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
