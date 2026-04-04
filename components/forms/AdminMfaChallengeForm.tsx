"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { recordAdminMfaChallengeEvent } from "@/app/actions/adminMfa";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { createSupabaseBrowserClient } from "@/supabase/client";

type ChallengeFactor = {
  factorType: string;
  friendlyName?: string;
  id: string;
};

export function AdminMfaChallengeForm({
  factors,
  redirectTo,
}: {
  factors: ChallengeFactor[];
  redirectTo: string;
}) {
  const router = useRouter();
  const [selectedFactorId, setSelectedFactorId] = useState(factors[0]?.id ?? "");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedFactor =
    factors.find((factor) => factor.id === selectedFactorId) ?? factors[0];

  const handleVerify = () => {
    if (!selectedFactor) {
      setError("No MFA factor is available for verification.");
      return;
    }

    if (verificationCode.length !== 6) {
      setError("Enter the 6-digit code from your enrolled authenticator.");
      return;
    }

    setError("");
    setInfo("");

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({
          factorId: selectedFactor.id,
        });

      if (challengeError || !challengeData) {
        await recordAdminMfaChallengeEvent({
          factorId: selectedFactor.id,
          message: challengeError?.message || "Unable to create MFA challenge.",
          success: false,
        }).catch(() => undefined);
        setError(challengeError?.message || "Unable to create an MFA challenge.");
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: selectedFactor.id,
        challengeId: challengeData.id,
        code: verificationCode,
      });

      if (verifyError) {
        await recordAdminMfaChallengeEvent({
          factorId: selectedFactor.id,
          message: verifyError.message,
          success: false,
        }).catch(() => undefined);
        setError(verifyError.message);
        return;
      }

      await recordAdminMfaChallengeEvent({
        factorId: selectedFactor.id,
        success: true,
      }).catch(() => undefined);
      setInfo("Verification complete. Redirecting to the admin dashboard...");
      router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Multi-factor verification required</AlertTitle>
        <AlertDescription>
          Enter the current code from your enrolled authenticator app to
          continue into MOVRR Admin.
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {info ? (
        <Alert>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      {factors.length > 1 ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Choose authenticator</label>
          <div className="grid gap-2">
            {factors.map((factor) => {
              const isSelected = factor.id === selectedFactorId;

              return (
                <button
                  key={factor.id}
                  type="button"
                  className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/40"
                  }`}
                  onClick={() => setSelectedFactorId(factor.id)}
                  disabled={isPending}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {factor.friendlyName || "Authenticator"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Factor type: {factor.factorType.toUpperCase()}
                    </div>
                  </div>
                  <Badge variant={isSelected ? "default" : "outline"}>
                    {isSelected ? "Selected" : "Available"}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      ) : selectedFactor ? (
        <div className="rounded-lg border border-border/70 bg-background/80 px-4 py-3">
          <div className="font-medium">
            {selectedFactor.friendlyName || "Authenticator"}
          </div>
          <div className="text-xs text-muted-foreground">
            Factor type: {selectedFactor.factorType.toUpperCase()}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium">Verification code</label>
        <InputOTP
          maxLength={6}
          value={verificationCode}
          onChange={setVerificationCode}
          disabled={isPending}
          containerClassName="justify-center"
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button className="w-full" onClick={handleVerify} disabled={isPending}>
        {isPending ? "Verifying..." : "Verify And Continue"}
      </Button>
    </div>
  );
}
