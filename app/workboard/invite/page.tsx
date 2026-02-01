"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { acceptWorkboardInvite } from "@/app/actions/workboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function WorkboardInvitePage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<
    | "idle"
    | "accepting"
    | "accepted"
    | "already_accepted"
    | "expired"
    | "missing"
    | "error"
  >("idle");

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }

    let active = true;
    setStatus("accepting");
    acceptWorkboardInvite(token)
      .then((result) => {
        if (!active) return;
        if (result.status === "already_accepted") {
          setStatus("already_accepted");
        } else {
          setStatus("accepted");
        }
      })
      .catch((err) => {
        const message = String(err?.message || "");
        if (message.toLowerCase().includes("expired")) {
          setStatus("expired");
        } else {
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-4 p-6 text-center">
          {status === "accepting" && (
            <>
              <h1 className="text-xl font-semibold">Joining Workboard…</h1>
              <p className="text-sm text-muted-foreground">
                We are confirming your invite.
              </p>
            </>
          )}
          {status === "accepted" && (
            <>
              <h1 className="text-xl font-semibold">Invite accepted</h1>
              <p className="text-sm text-muted-foreground">
                You now have access to the MOVRR Workboard.
              </p>
              <Button asChild>
                <Link href="/workboard">Open Workboard</Link>
              </Button>
            </>
          )}
          {status === "already_accepted" && (
            <>
              <h1 className="text-xl font-semibold">Invite already accepted</h1>
              <p className="text-sm text-muted-foreground">
                This invite has already been used. You can access the Workboard
                now.
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
                Please request a new invite from your team admin.
              </p>
            </>
          )}
          {status === "missing" && (
            <>
              <h1 className="text-xl font-semibold">Invite link missing</h1>
              <p className="text-sm text-muted-foreground">
                Please use the invite link provided by your team admin.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-xl font-semibold">Unable to accept invite</h1>
              <p className="text-sm text-muted-foreground">
                Please try again or contact your team admin.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
