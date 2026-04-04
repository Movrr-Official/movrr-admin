"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

const RECOVERY_COOKIE = "movrr-admin-password-recovery";
const RECOVERY_COOKIE_PATH = "/auth/reset-password";

const ALLOWED_OTP_TYPES = new Set<string>([
  "recovery",
  "signup",
  "invite",
  "email_change",
  "magiclink",
]);

/**
 * Verify a token_hash OTP (recovery, signup, invite, etc.)
 *
 * Called from /auth/confirm ONLY after the user explicitly clicks "Continue".
 * Deferring token consumption to deliberate user interaction protects against
 * email scanners (SafeLinks, Proofpoint, Google Safe Browsing) that follow
 * links automatically and would otherwise consume the one-time token.
 */
export async function confirmOtp({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}): Promise<never> {
  if (!tokenHash || !type || !ALLOWED_OTP_TYPES.has(type)) {
    logger.warn("[confirmOtp] Invalid params", {
      type,
      hasToken: Boolean(tokenHash),
    });
    redirect("/auth/signin?error=invalid_link");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error) {
    logger.error("[confirmOtp] verifyOtp failed", {
      message: error.message,
      type,
    });
    redirect("/auth/signin?error=token_invalid");
  }

  logger.info("[confirmOtp] OTP verified successfully", { type });

  if (type === "recovery") {
    // Set the httpOnly recovery cookie so the reset-password page can
    // confirm this is a legitimate recovery session.
    const cookieStore = await cookies();
    cookieStore.set({
      name: RECOVERY_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: RECOVERY_COOKIE_PATH,
      maxAge: 60 * 15, // 15 minutes
    });
    redirect("/auth/reset-password");
  }

  // Guard against open redirects: only allow relative paths on same origin.
  const safePath =
    next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(safePath);
}

/**
 * Clear the password recovery cookie after a successful password update.
 *
 * The cookie is set httpOnly by the server, so it cannot be cleared by
 * client-side JavaScript (document.cookie has no effect on httpOnly cookies).
 * This server action must be called after updateUser() succeeds.
 */
export async function clearRecoveryCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: RECOVERY_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: RECOVERY_COOKIE_PATH,
    maxAge: 0,
  });
}
