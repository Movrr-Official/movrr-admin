"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { acceptWorkboardInvite } from "@/app/actions/workboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const INVITE_TOKEN_STORAGE_KEY = "movrr.workboard.inviteToken";

type InviteUiStatus =
  | "accepting"
  | "accepted"
  | "already_accepted"
  | "expired"
  | "revoked"
  | "missing"
  | "wrong_account"
  | "not_provisioned"
  | "board_deleted"
  | "membership_failed"
  | "migration_missing"
  | "error";

function resolveToken(searchToken: string | null): string | null {
  if (searchToken?.trim()) {
    try {
      sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, searchToken.trim());
    } catch {
      // sessionStorage may be unavailable
    }
    return searchToken.trim();
  }

  try {
    const stored = sessionStorage.getItem(INVITE_TOKEN_STORAGE_KEY);
    return stored?.trim() || null;
  } catch {
    return null;
  }
}

function clearStoredToken() {
  try {
    sessionStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function mapErrorCode(code: string): InviteUiStatus {
  switch (code) {
    case "expired":
      return "expired";
    case "revoked":
    case "rejected":
      return "revoked";
    case "email_mismatch":
      return "wrong_account";
    case "not_provisioned":
    case "ineligible_role":
      return "not_provisioned";
    case "board_deleted":
      return "board_deleted";
    case "membership_failed":
    case "membership_unconfirmed":
    case "accepted_without_membership":
    case "transaction_failed":
      return "membership_failed";
    case "migration_missing":
    case "migration_incomplete":
      return "migration_missing";
    case "missing_token":
    case "invalid_token":
    case "not_found":
      return "missing";
    default:
      return "error";
  }
}

export default function WorkboardInvitePage() {
  const params = useSearchParams();
  const [status, setStatus] = useState<InviteUiStatus>("accepting");
  const [detail, setDetail] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0);
  const token = useMemo(
    () => resolveToken(params.get("token")),
    [params, retryKey],
  );

  const switchAccountHref = useMemo(() => {
    const destination = token
      ? `/workboard/invite?token=${encodeURIComponent(token)}`
      : "/workboard/invite";
    return `/auth/signin?redirectTo=${encodeURIComponent(destination)}&reason=auth_required`;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      setDetail("Please use the invite link provided by your team admin.");
      return;
    }

    let active = true;
    setStatus("accepting");
    setDetail("");

    acceptWorkboardInvite(token)
      .then((result) => {
        if (!active) return;
        if (result.success) {
          clearStoredToken();
          setStatus(
            result.status === "already_accepted"
              ? "already_accepted"
              : "accepted",
          );
          return;
        }
        setStatus(mapErrorCode(result.code));
        setDetail(result.message);
      })
      .catch((err) => {
        if (!active) return;
        const message = String(err?.message || "Unable to accept invite");
        const lower = message.toLowerCase();
        if (lower.includes("migration")) {
          setStatus("migration_missing");
        } else if (lower.includes("expired")) {
          setStatus("expired");
        } else if (lower.includes("match")) {
          setStatus("wrong_account");
        } else {
          setStatus("error");
        }
        setDetail(message);
      });

    return () => {
      active = false;
    };
  }, [token, retryKey]);

  const retry = () => {
    setRetryKey((value) => value + 1);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-lg">
        <CardContent
          className="space-y-4 p-6 text-center"
          aria-live="polite"
          aria-busy={status === "accepting"}
          role="status"
        >
          {status === "accepting" && (
            <>
              <h1 className="text-xl font-semibold">Joining Workboard…</h1>
              <p className="text-sm text-muted-foreground">
                We are confirming your invite and activating membership.
              </p>
            </>
          )}
          {status === "accepted" && (
            <>
              <h1 className="text-xl font-semibold">Invite accepted</h1>
              <p className="text-sm text-muted-foreground">
                Your Workboard membership is active. You can open the board now.
              </p>
              <Button asChild>
                <Link href="/workboard">Open Workboard</Link>
              </Button>
            </>
          )}
          {status === "already_accepted" && (
            <>
              <h1 className="text-xl font-semibold">Already a member</h1>
              <p className="text-sm text-muted-foreground">
                This invite was already used and your membership is active.
              </p>
              <Button asChild>
                <Link href="/workboard">Open Workboard</Link>
              </Button>
            </>
          )}
          {status === "expired" && (
            <>
              <h1 className="text-xl font-semibold">Invite expired</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "Please ask your team admin to resend a Workboard invitation."}
              </p>
            </>
          )}
          {status === "revoked" && (
            <>
              <h1 className="text-xl font-semibold">Invite revoked</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "This invitation is no longer valid. Ask your admin for a new invite."}
              </p>
            </>
          )}
          {status === "missing" && (
            <>
              <h1 className="text-xl font-semibold">Invite link missing</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "Please use the invite link provided by your team admin."}
              </p>
              <Button asChild variant="outline">
                <Link href={switchAccountHref}>Sign in</Link>
              </Button>
            </>
          )}
          {status === "wrong_account" && (
            <>
              <h1 className="text-xl font-semibold">Wrong account</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "You are signed in with a different email than the invitation. Sign out and sign in with the invited account."}
              </p>
              <div className="flex justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href={switchAccountHref}>Switch account</Link>
                </Button>
                <Button type="button" onClick={retry}>
                  Retry
                </Button>
              </div>
            </>
          )}
          {status === "not_provisioned" && (
            <>
              <h1 className="text-xl font-semibold">Account not eligible</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "Workboard invites require an existing MOVRR admin account with an eligible role."}
              </p>
            </>
          )}
          {status === "board_deleted" && (
            <>
              <h1 className="text-xl font-semibold">Workboard unavailable</h1>
              <p className="text-sm text-muted-foreground">
                {detail || "This workboard no longer exists."}
              </p>
            </>
          )}
          {status === "membership_failed" && (
            <>
              <h1 className="text-xl font-semibold">Membership failed</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "We could not activate your membership. Retry, or ask your admin to resend the invite."}
              </p>
              <Button type="button" onClick={retry}>
                Retry
              </Button>
            </>
          )}
          {status === "migration_missing" && (
            <>
              <h1 className="text-xl font-semibold">Service unavailable</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "Invitation services are not fully deployed. Contact your administrator."}
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-xl font-semibold">Unable to accept invite</h1>
              <p className="text-sm text-muted-foreground">
                {detail ||
                  "Please try again or contact your team admin for a new invitation."}
              </p>
              <Button type="button" onClick={retry}>
                Retry
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
