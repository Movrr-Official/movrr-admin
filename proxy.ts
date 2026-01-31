import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Simple token-based access for optimizer proxy routes
  try {
    const pathname = request.nextUrl.pathname || "";
    if (pathname.startsWith("/api/optimize")) {
      const expected =
        process.env.ROUTE_OPTIMIZER_TOKEN ||
        process.env.ROUTE_OPTIMIZER_KEY ||
        "";
      const previous =
        process.env.ROUTE_OPTIMIZER_PREV_TOKEN ||
        process.env.ROUTE_OPTIMIZER_OLD_TOKEN ||
        "";

      if (!expected && !previous) {
        console.warn(
          "ROUTE_OPTIMIZER_TOKEN and ROUTE_OPTIMIZER_PREV_TOKEN are not set; optimizer proxy will run without a token",
        );
      }
    }
  } catch (e) {
    console.error("proxy token check error", e);
    return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  if (request.nextUrl.pathname === "/") {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error("Auth error:", userError);
    }

    // Log access attempt
    const logData = {
      user_id: user?.id || null,
      email: user?.email || null,
      action: `admin_access_attempt:${request.nextUrl.pathname}`,
      ip_address: request.headers.get("x-forwarded-for") || "unknown",
      user_agent: request.headers.get("user-agent") || "unknown",
      success: false,
    };

    const log = async (data: any) => {
      fetch(`${request.nextUrl.origin}/api/log-admin-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
    };

    if (!user) {
      // Log unauthorized access attempt
      await log(logData);

      // Redirect to login with return URL
      const redirectUrl = new URL("/auth/signin", request.url);
      redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Check if user is an admin
    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (adminError) {
      console.error("Admin user query error:", adminError);
    }

    if (!adminUser) {
      // Log unauthorized access attempt
      await log(logData);

      // Redirect to unauthorized page
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    // Log successful access
    await log({
      ...logData,
      success: true,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
