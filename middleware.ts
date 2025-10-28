import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  if (request.nextUrl.pathname === "/") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .single();

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
