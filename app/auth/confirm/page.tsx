import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmOtp } from "@/app/actions/authActions";

// ─── Per-type copy ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<
  string,
  { title: string; description: string; cta: string }
> = {
  recovery: {
    title: "Reset your password",
    description:
      "Click the button below to verify your identity and proceed to set a new password.",
    cta: "Continue to reset password",
  },
  signup: {
    title: "Confirm your email",
    description:
      "Click the button below to confirm your email address and activate your account.",
    cta: "Confirm email address",
  },
  invite: {
    title: "Accept your invitation",
    description:
      "Click the button below to accept your invitation and set up your account.",
    cta: "Accept invitation",
  },
  email_change: {
    title: "Confirm email change",
    description:
      "Click the button below to confirm your new email address.",
    cta: "Confirm new email",
  },
  magiclink: {
    title: "Sign in to Movrr",
    description: "Click the button below to complete your sign-in.",
    cta: "Continue to sign in",
  },
};

const ALLOWED_TYPES = new Set([
  "recovery",
  "signup",
  "invite",
  "email_change",
  "magiclink",
]);

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * /auth/confirm — click-through protection layer.
 *
 * Email scanners (SafeLinks, Proofpoint, Google Safe Browsing) follow URLs
 * automatically. If auth links pointed directly to the token-consuming endpoint,
 * scanners would silently consume one-time tokens before the user ever clicks.
 *
 * This page receives the token_hash and type from the email link but does NOT
 * consume the token on load. The token is only consumed when the user explicitly
 * clicks the "Continue" button, which submits a Server Action.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash;
  const type = params.type;
  const next = params.next ?? "/";

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    redirect("/auth/signin?error=invalid_link");
  }

  const labels = TYPE_LABELS[type] ?? {
    title: "Verify your identity",
    description: "Click the button below to continue.",
    cta: "Continue",
  };

  // Bind params server-side — the action runs only when the form is submitted.
  const action = confirmOtp.bind(null, { tokenHash, type, next });

  return (
    <Card className="border-0">
      <CardHeader className="text-center pb-6">
        <CardTitle className="text-3xl font-bold tracking-tight">
          {labels.title}
        </CardTitle>
        <CardDescription className="text-lg">
          {labels.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action}>
          <Button type="submit" className="w-full">
            {labels.cta}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
