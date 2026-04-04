"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldEllipsis,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  removeOwnAdminMfaFactor,
  resetAdminMfaRecovery,
} from "@/app/actions/adminMfa";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import type {
  AdminMfaManagedFactor,
  AdminMfaRecoveryCandidate,
} from "@/lib/adminMfa";

const MFA_MANAGEMENT_PATH = "/account/security";

const formatTimestamp = (value: string | null) => {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const toRoleLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export function AdminMfaManagementPanel({
  adminEmail,
  adminRole,
  currentLevel,
  factors,
  recoveryTargets,
}: {
  adminEmail: string;
  adminRole: string;
  currentLevel: string | null;
  factors: AdminMfaManagedFactor[];
  recoveryTargets: AdminMfaRecoveryCandidate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [factorToRemove, setFactorToRemove] = useState<AdminMfaManagedFactor | null>(null);
  const [selectedRecoveryUserId, setSelectedRecoveryUserId] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);

  const verifiedFactorCount = useMemo(
    () => factors.filter((factor) => factor.status === "verified").length,
    [factors],
  );
  const selectedRecoveryTarget = recoveryTargets.find(
    (candidate) => candidate.userId === selectedRecoveryUserId,
  );
  const requiresStepUp = currentLevel !== "aal2";

  const handleAddFactor = () => {
    router.push(
      `/auth/mfa/setup?redirectTo=${encodeURIComponent(MFA_MANAGEMENT_PATH)}&mode=add`,
    );
  };

  const handleRemoveFactor = () => {
    if (!factorToRemove) return;

    startTransition(async () => {
      const result = await removeOwnAdminMfaFactor({ factorId: factorToRemove.id });

      if (!result.success) {
        toast({
          title: "Could not remove factor",
          description: result.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "MFA factor removed",
        description: `${factorToRemove.friendlyName} has been removed from your admin account.`,
      });
      setFactorToRemove(null);
      router.refresh();
    });
  };

  const handleRecoveryReset = () => {
    if (!selectedRecoveryTarget) {
      toast({
        title: "Select an admin",
        description: "Choose the admin account that needs an MFA recovery reset.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      const result = await resetAdminMfaRecovery({
        reason: recoveryReason,
        targetAdminUserId: selectedRecoveryTarget.userId,
      });

      if (!result.success) {
        toast({
          title: "Recovery reset failed",
          description: result.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Recovery reset complete",
        description: `${selectedRecoveryTarget.email} must enroll a new authenticator on next sign-in.`,
      });
      setShowRecoveryDialog(false);
      setRecoveryReason("");
      setSelectedRecoveryUserId("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-background/95">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-2xl">Multi-Factor Security</CardTitle>
              <Badge variant={requiresStepUp ? "warning" : "success"}>
                {requiresStepUp ? "Step-up required" : "Elevated session"}
              </Badge>
            </div>
            <CardDescription className="max-w-2xl">
              Protect admin access with authenticator-backed MFA, maintain at least
              two verified factors for resilience, and use recovery reset only for
              audited lost-device incidents.
            </CardDescription>
          </div>

          <Button onClick={handleAddFactor} className="sm:min-w-44">
            <Plus className="mr-2 h-4 w-4" />
            Add Authenticator
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-sm text-muted-foreground">Admin account</div>
            <div className="mt-1 font-medium">{adminEmail}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {toRoleLabel(adminRole)}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-sm text-muted-foreground">Verified factors</div>
            <div className="mt-1 text-2xl font-semibold">{verifiedFactorCount}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Enterprise baseline: keep at least 2 verified factors where possible.
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="text-sm text-muted-foreground">Current assurance</div>
            <div className="mt-1 text-2xl font-semibold uppercase">
              {currentLevel ?? "Unknown"}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Sensitive MFA management actions require an `aal2` session.
            </div>
          </div>
        </CardContent>
      </Card>

      {requiresStepUp ? (
        <Alert>
          <ShieldEllipsis className="h-4 w-4" />
          <AlertTitle>Re-verify before managing factors</AlertTitle>
          <AlertDescription>
            Your current admin session is not at `aal2`. Complete an MFA challenge
            before removing factors or running recovery resets.
          </AlertDescription>
        </Alert>
      ) : null}

      {verifiedFactorCount < 2 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Add a second factor</AlertTitle>
          <AlertDescription>
            A single authenticator is operationally fragile. Add another verified
            factor before replacing or retiring your primary device.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60 bg-background/95">
        <CardHeader>
          <CardTitle className="text-xl">Enrolled Authenticators</CardTitle>
          <CardDescription>
            Remove stale or replaced factors from an elevated session. The last
            verified factor cannot be removed through self-service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {factors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No MFA factors are enrolled yet.
            </div>
          ) : (
            factors.map((factor) => {
              const isLastVerifiedFactor =
                factor.status === "verified" && verifiedFactorCount <= 1;

              return (
                <div
                  key={factor.id}
                  className="rounded-2xl border border-border/60 bg-muted/10 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{factor.friendlyName}</div>
                        <Badge
                          variant={
                            factor.status === "verified" ? "success" : "warning"
                          }
                        >
                          {factor.status}
                        </Badge>
                        <Badge variant="outline">{factor.factorType.toUpperCase()}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Added {formatTimestamp(factor.createdAt)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Last updated {formatTimestamp(factor.updatedAt)}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {factor.id}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="md:min-w-36"
                      disabled={requiresStepUp || isPending || isLastVerifiedFactor}
                      onClick={() => setFactorToRemove(factor)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Factor
                    </Button>
                  </div>

                  {isLastVerifiedFactor ? (
                    <>
                      <Separator className="my-4" />
                      <div className="text-sm text-muted-foreground">
                        Add another authenticator before removing this factor. MOVRR
                        blocks last-factor self-removal to prevent accidental lockout.
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {adminRole === "super_admin" ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-warning" />
              <CardTitle className="text-xl">Emergency Recovery Reset</CardTitle>
            </div>
            <CardDescription>
              Use only for verified lost-device or inaccessible-factor incidents.
              This deletes all MFA factors for the selected admin and forces fresh
              enrollment on the next sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
              <div className="space-y-2">
                <Label htmlFor="recovery-admin">Target admin</Label>
                <Select
                  value={selectedRecoveryUserId}
                  onValueChange={setSelectedRecoveryUserId}
                  disabled={isPending}
                >
                  <SelectTrigger id="recovery-admin" className="w-full">
                    <SelectValue placeholder="Select an admin account" />
                  </SelectTrigger>
                  <SelectContent>
                    {recoveryTargets.map((target) => (
                      <SelectItem key={target.userId} value={target.userId}>
                        {target.displayName} · {target.email} · {toRoleLabel(target.role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recovery-reason">Recovery reason</Label>
                <Textarea
                  id="recovery-reason"
                  value={recoveryReason}
                  onChange={(event) => setRecoveryReason(event.target.value)}
                  placeholder="Document the verified operator incident, approval source, and why a recovery reset is required."
                  className="min-h-28"
                  disabled={isPending}
                />
              </div>
            </div>

            <Alert className="border-warning/40">
              <RotateCcw className="h-4 w-4" />
              <AlertTitle>High-impact security action</AlertTitle>
              <AlertDescription>
                Recovery resets are audited and should be tied to an incident or
                support case. The selected admin will be logged out of active sessions
                once verified factors are removed.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end">
              <Button
                variant="destructive"
                disabled={
                  requiresStepUp ||
                  isPending ||
                  !selectedRecoveryTarget ||
                  recoveryReason.trim().length < 20
                }
                onClick={() => setShowRecoveryDialog(true)}
              >
                Reset Admin MFA
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={Boolean(factorToRemove)}
        onOpenChange={(open) => {
          if (!open) setFactorToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove authenticator factor</AlertDialogTitle>
            <AlertDialogDescription>
              {factorToRemove
                ? `Remove ${factorToRemove.friendlyName} from your admin account? This action is audited, and removing a verified factor can require fresh authentication across active sessions.`
                : "Remove this authenticator factor?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                handleRemoveFactor();
              }}
            >
              {isPending ? "Removing..." : "Remove Factor"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm recovery reset</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRecoveryTarget
                ? `Delete every MFA factor for ${selectedRecoveryTarget.email}? They will need to enroll again on next sign-in.`
                : "Delete every MFA factor for the selected admin?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedRecoveryTarget ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
              <div className="font-medium">{selectedRecoveryTarget.displayName}</div>
              <div className="text-muted-foreground">{selectedRecoveryTarget.email}</div>
              <div className="mt-2 text-muted-foreground">
                Reason: {recoveryReason.trim()}
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                handleRecoveryReset();
              }}
            >
              {isPending ? "Resetting..." : "Confirm Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
