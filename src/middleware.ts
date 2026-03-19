import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow login page without auth
  if (request.nextUrl.pathname === "/login") {
    if (user) {
      // Already logged in, redirect to home
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Role-based route protection
  const role = (user.app_metadata?.role as string) ?? "sales";
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/production") && !["production", "admin"].includes(role)) {
    return NextResponse.redirect(new URL("/sales", request.url));
  }
  if (pathname.startsWith("/management") && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
