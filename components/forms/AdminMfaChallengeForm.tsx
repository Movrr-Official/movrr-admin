"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { recordAdminMfaChallengeEvent } from "@/app/actions/adminMfa";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
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
  const [selectedFactorId, setSelectedFactorId] = useState(factors[0]?.id ?? "");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const inFlightRef = useRef(false);

  const selectedFactor =
    factors.find((factor) => factor.id === selectedFactorId) ?? factors[0];

  const verifyCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();

      if (!selectedFactor) {
        setError("No authenticator is available for verification.");
        return;
      }

      if (trimmed.length !== 6) {
        setError("Enter the 6-digit code from your authenticator app.");
        return;
      }

      // Prevent duplicate submits for the same completed code.
      if (inFlightRef.current || isComplete) return;
      inFlightRef.current = true;
      setIsVerifying(true);
      setError("");

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({
            factorId: selectedFactor.id,
          });

        if (challengeError || !challengeData) {
          await recordAdminMfaChallengeEvent({
            factorId: selectedFactor.id,
            message:
              challengeError?.message || "Unable to create MFA challenge.",
            success: false,
          }).catch(() => undefined);
          setError(
            challengeError?.message || "Unable to create an MFA challenge.",
          );
          return;
        }

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: selectedFactor.id,
          challengeId: challengeData.id,
          code: trimmed,
        });

        if (verifyError) {
          await recordAdminMfaChallengeEvent({
            factorId: selectedFactor.id,
            message: verifyError.message,
            success: false,
          }).catch(() => undefined);
          setVerificationCode("");
          setError(verifyError.message);
          return;
        }

        await recordAdminMfaChallengeEvent({
          factorId: selectedFactor.id,
          success: true,
        }).catch(() => undefined);
        setIsComplete(true);
        window.location.replace(redirectTo);
      } finally {
        inFlightRef.current = false;
        setIsVerifying(false);
      }
    },
    [isComplete, redirectTo, selectedFactor],
  );

  const handleCodeChange = (value: string) => {
    const next = value.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(next);
    setError("");

    // As soon as all 6 digits are present, start verification automatically.
    if (next.length === 6) {
      void verifyCode(next);
    }
  };

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Verification complete. Continuing…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {factors.length > 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Authenticator</p>
          <div className="flex flex-wrap gap-2">
            {factors.map((factor) => {
              const isSelected = factor.id === selectedFactorId;
              return (
                <button
                  key={factor.id}
                  type="button"
                  disabled={isVerifying}
                  onClick={() => {
                    setSelectedFactorId(factor.id);
                    setVerificationCode("");
                    setError("");
                    inFlightRef.current = false;
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {factor.friendlyName || factor.factorType.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label
          htmlFor="mfa-otp"
          className="text-sm font-medium text-foreground"
        >
          Verification code
        </label>
        <div className="space-y-3">
        <InputOTP
          id="mfa-otp"
          maxLength={6}
          value={verificationCode}
          onChange={handleCodeChange}
          disabled={isVerifying}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          containerClassName="w-full"
        >
          <InputOTPGroup className="grid w-full grid-cols-6 gap-2 sm:gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <InputOTPSlot
                key={index}
                index={index}
                className="h-12 w-full rounded-md border border-input text-base font-medium shadow-none first:rounded-md first:border-l last:rounded-md data-[active=true]:border-foreground data-[active=true]:ring-1 data-[active=true]:ring-foreground/30"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error ? (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Verification starts automatically when all 6 digits are entered.
          </p>
        )}
        </div>
      </div>

      <Button
        className="h-11 w-full text-sm font-semibold"
        onClick={() => void verifyCode(verificationCode)}
        disabled={isVerifying || verificationCode.length !== 6}
      >
        {isVerifying ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying…
          </span>
        ) : (
          "Confirm"
        )}
      </Button>
    </div>
  );
}
