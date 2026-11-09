import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/infrastructure/config/public";

/** Refresh Auth cookies only on the applicant/auth surfaces that need them. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabasePublicConfig();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes/validates the token with Auth; protected pages and operations still enforce verification.
  try {
    await supabase.auth.getUser();
  } catch {
    // Protected server routes fail closed when they cannot independently verify the user.
  }
  return response;
}

export const config = {
  matcher: ["/applicant/:path*", "/auth/:path*", "/api/applicant-auth/:path*"],
};
