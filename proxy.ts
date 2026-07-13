import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "@/lib/securityHeaders";
import {
  safeEqualBearerToken,
  safeEqualString,
} from "@/lib/secureCompare";
import {
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_URL,
  ROUTE_OPTIMIZER_KEY,
  ROUTE_OPTIMIZER_OLD_TOKEN,
  ROUTE_OPTIMIZER_PREV_TOKEN,
  ROUTE_OPTIMIZER_TOKEN,
} from "@/lib/env";

const PUBLIC_PATHS = [
  "/auth/signin",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/unauthorized",
];

const PUBLIC_API_PREFIX = "/api/public/";

/** Mobile rider ingest — JWT validated in route handlers, not admin cookies. */
const RIDER_API_PREFIX = "/api/sessions/";

/** Cron/maintenance jobs — bearer token validated in route handlers. */
const INTERNAL_API_PREFIX = "/api/internal/";

const DASHBOARD_ACCESS_ROLES = new Set([
  "admin",
  "super_admin",
  "moderator",
  "support",
  "compliance_officer",
  "government",
]);

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith(PUBLIC_API_PREFIX)) return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isRiderApiPath(pathname: string): boolean {
  return pathname.startsWith(RIDER_API_PREFIX);
}

function isInternalApiPath(pathname: string): boolean {
  return pathname.startsWith(INTERNAL_API_PREFIX);
}

function isOptimizerServiceAuthorized(request: NextRequest): boolean {
  const expected = ROUTE_OPTIMIZER_TOKEN || ROUTE_OPTIMIZER_KEY || "";
  const previous =
    ROUTE_OPTIMIZER_PREV_TOKEN || ROUTE_OPTIMIZER_OLD_TOKEN || "";
  const authHeader = request.headers.get("authorization") ?? "";
  const routeToken = request.headers.get("x-route-token") ?? "";

  if (expected) {
    if (
      safeEqualBearerToken(authHeader, expected) ||
      safeEqualString(routeToken, expected)
    ) {
      return true;
    }
  }

  if (previous) {
    if (
      safeEqualBearerToken(authHeader, previous) ||
      safeEqualString(routeToken, previous)
    ) {
      return true;
    }
  }

  return false;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname || "";

  // Optimizer routes: deny when unconfigured; allow valid service tokens
  if (pathname.startsWith("/api/optimize")) {
    const expected = ROUTE_OPTIMIZER_TOKEN || ROUTE_OPTIMIZER_KEY || "";
    const previous =
      ROUTE_OPTIMIZER_PREV_TOKEN || ROUTE_OPTIMIZER_OLD_TOKEN || "";

    if (!expected && !previous) {
      return applySecurityHeaders(
        NextResponse.json({ error: "optimizer_not_configured" }, { status: 503 }),
        request,
      );
    }

    if (isOptimizerServiceAuthorized(request)) {
      return applySecurityHeaders(supabaseResponse, request);
    }
  }

  // Public routes — skip auth entirely
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(supabaseResponse, request);
  }

  // Rider mobile ingest — bearer JWT validated in route handlers
  if (isRiderApiPath(pathname)) {
    return applySecurityHeaders(supabaseResponse, request);
  }

  // Internal cron/maintenance — bearer validated in route handlers
  if (isInternalApiPath(pathname)) {
    return applySecurityHeaders(supabaseResponse, request);
  }

  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          ),
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    // Edge middleware: avoid logging auth details; deny via redirect below.
  }

  if (!user) {
    const redirectUrl = new URL("/auth/signin", request.url);
    redirectUrl.searchParams.set(
      "redirectTo",
      `${pathname}${request.nextUrl.search || ""}`,
    );
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request);
  }

  // Validate role against admin_users table (authoritative source)
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (adminError) {
    // Edge middleware: avoid logging admin lookup failures.
  }

  const role = adminUser?.role as string | undefined;

  if (!adminUser || !role || !DASHBOARD_ACCESS_ROLES.has(role)) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/unauthorized", request.url)),
      request,
    );
  }

  return applySecurityHeaders(supabaseResponse, request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
