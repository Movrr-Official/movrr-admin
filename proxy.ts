import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "@/lib/securityHeaders";
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
  "/unauthorized",
];

const PUBLIC_API_PREFIX = "/api/public/";

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

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname || "";

  // Simple token-based access for optimizer proxy routes
  try {
    if (pathname.startsWith("/api/optimize")) {
      const expected = ROUTE_OPTIMIZER_TOKEN || ROUTE_OPTIMIZER_KEY || "";
      const previous =
        ROUTE_OPTIMIZER_PREV_TOKEN || ROUTE_OPTIMIZER_OLD_TOKEN || "";

      if (!expected && !previous) {
        console.warn(
          "ROUTE_OPTIMIZER_TOKEN and ROUTE_OPTIMIZER_PREV_TOKEN are not set; optimizer proxy will run without a token",
        );
      }
    }
  } catch (e) {
    console.error("proxy token check error", e);
    const response = new NextResponse(
      JSON.stringify({ error: "unauthorized" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
    return applySecurityHeaders(response, request);
  }

  // Public routes — skip auth entirely
  if (isPublicPath(pathname)) {
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
    console.error("Auth error:", userError);
  }

  if (!user) {
    const redirectUrl = new URL("/auth/signin", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request);
  }

  // Validate role against admin_users table (authoritative source)
  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (adminError) {
    console.error("Admin user query error:", adminError);
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
