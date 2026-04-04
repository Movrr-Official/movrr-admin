import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

/**
 * /auth/callback — handles Supabase auth redirects.
 *
 * PKCE code exchange (code param):
 *   Exchanged immediately — PKCE codes are bound to the originating browser
 *   session, so email scanners cannot exploit them.
 *
 * Token-hash (token_hash + type params):
 *   NOT consumed here. Forwarded to /auth/confirm so the user must explicitly
 *   click "Continue" before the token is consumed. This prevents email scanners
 *   (SafeLinks, Proofpoint, Google Safe Browsing) from silently consuming
 *   one-time tokens before the actual user interacts.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  logger.info("[auth/callback] Incoming", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type,
    next,
  });

  // ── PKCE code exchange ──────────────────────────────────────────────────────
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error("[auth/callback] exchangeCodeForSession failed", {
        message: error.message,
      });
      return NextResponse.redirect(
        new URL("/auth/signin?error=auth_callback_failed", url.origin),
      );
    }

    logger.info("[auth/callback] PKCE code exchanged", { next });

    const safePath =
      next.startsWith("/") && !next.startsWith("//") ? next : "/";

    if (safePath === "/auth/reset-password") {
      const response = NextResponse.redirect(
        new URL("/auth/reset-password", url.origin),
      );
      response.cookies.set({
        name: "movrr-admin-password-recovery",
        value: "1",
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        path: "/auth/reset-password",
        maxAge: 60 * 15,
      });
      return response;
    }

    return NextResponse.redirect(new URL(safePath, url.origin));
  }

  // ── Token-hash: forward to /auth/confirm (no consumption here) ─────────────
  if (tokenHash && type) {
    logger.info("[auth/callback] Forwarding token_hash to /auth/confirm", {
      type,
    });
    const confirmUrl = new URL("/auth/confirm", url.origin);
    confirmUrl.searchParams.set("token_hash", tokenHash);
    confirmUrl.searchParams.set("type", type);
    if (next !== "/") confirmUrl.searchParams.set("next", next);
    return NextResponse.redirect(confirmUrl);
  }

  logger.warn("[auth/callback] No code or token_hash");
  return NextResponse.redirect(
    new URL("/auth/signin?error=auth_callback_failed", url.origin),
  );
}
