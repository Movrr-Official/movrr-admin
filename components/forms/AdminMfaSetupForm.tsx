"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

import { recordAdminMfaEnrollmentSuccess } from "@/app/actions/adminMfa";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { createSupabaseBrowserClient } from "@/supabase/client";

type EnrollmentState = {
  factorId: string;
  qrCode: string;
  secret: string;
};

const normalizeQrCodeSource = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("data:image/svg+xml") ||
    trimmed.startsWith("data:image/png") ||
    trimmed.startsWith("data:image/jpeg")
  ) {
    return trimmed;
  }

  return `data:image/svg+xml;utf-8,${trimmed}`;
};

export function AdminMfaSetupForm({
  email,
  redirectTo,
}: {
  email: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [deviceName, setDeviceName] = useState("Primary authenticator");
  const [verificationCode, setVerificationCode] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleEnroll = () => {
    setError("");
    setInfo("");

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: factorData, error: factorError } =
        await supabase.auth.mfa.listFactors();

      if (factorError) {
        setError(factorError.message);
        return;
      }

      const staleFactors =
        factorData?.all?.filter(
          (factor) =>
            factor.factor_type === "totp" && factor.status === "unverified",
        ) ?? [];

      for (const factor of staleFactors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });

        if (unenrollError) {
          setError(unenrollError.message);
          return;
        }
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "MOVRR Admin",
        friendlyName: deviceName.trim() || "Primary authenticator",
      });

      if (enrollError || !data || data.type !== "totp") {
        setError(enrollError?.message || "Unable to start MFA enrollment.");
        return;
      }

      let qrCode = normalizeQrCodeSource(data.totp.qr_code);

      try {
        qrCode = await QRCode.toDataURL(data.totp.uri, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 176,
          color: {
            dark: "#111827",
            light: "#FFFFFF",
          },
        });
      } catch {
        // Fall back to the provider-supplied QR payload if local generation fails.
      }

      setEnrollment({
        factorId: data.id,
        qrCode,
        secret: data.totp.secret,
      });
      setInfo(
        `Authenticator setup started for ${email}. Scan the QR code, then enter the 6-digit code from your app.`,
      );
    });
  };

  const handleVerify = () => {
    if (!enrollment) {
      setError("Start setup before entering a verification code.");
      return;
    }

    if (verificationCode.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setError("");

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code: verificationCode,
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      await recordAdminMfaEnrollmentSuccess({
        factorId: enrollment.factorId,
        redirectTo,
      }).catch(() => undefined);

      router.push(redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {!enrollment ? (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Secure your admin account</AlertTitle>
          <AlertDescription>
            MOVRR Admin uses authenticator-app MFA for protected operator access.
            Use Google Authenticator, 1Password, Authy, or a similar TOTP app.
          </AlertDescription>
        </Alert>
      ) : null}

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

      {!enrollment ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Device label</label>
          <Input
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            disabled={isPending}
            placeholder="Primary authenticator"
          />
        </div>
      ) : null}

      {!enrollment ? (
        <Button className="w-full" onClick={handleEnroll} disabled={isPending}>
          {isPending ? "Generating QR Code..." : "Generate Authenticator Setup"}
        </Button>
      ) : (
        <div className="space-y-5 rounded-xl border border-border/60 bg-background/80 p-5">
          <div className="space-y-3 text-center">
            <div className="mx-auto inline-flex rounded-xl border border-border bg-white p-3">
              <Image
                src={normalizeQrCodeSource(enrollment.qrCode)}
                alt="MOVRR admin MFA QR code"
                width={144}
                height={144}
                unoptimized
                className="h-36 w-36"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Manual setup secret</label>
            <div className="rounded-md border border-dashed border-border px-3 py-2 font-mono text-sm break-all">
              {enrollment.secret}
            </div>
          </div>

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

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => {
                setEnrollment(null);
                setVerificationCode("");
                setInfo("");
                setError("");
              }}
              disabled={isPending}
            >
              Start Over
            </Button>
            <Button
              className="sm:flex-1"
              onClick={handleVerify}
              disabled={isPending}
            >
              {isPending ? "Verifying..." : "Verify And Continue"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
