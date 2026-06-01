import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getRequestIp } from "./lib/request-ip";

const SESSION_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function clearSessionCookies(response: NextResponse, request: NextRequest): void {
  for (const cookie of request.cookies.getAll()) {
    if (
      SESSION_COOKIE_PREFIXES.some((prefix) => cookie.name.startsWith(prefix))
    ) {
      response.cookies.set(cookie.name, "", {
        expires: new Date(0),
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
  }
}

export const middlewareCallback = (req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const requestIp = getRequestIp(req);

  if (session?.user?.ipAddress && requestIp && session.user.ipAddress !== requestIp) {
    const loginUrl = new URL("/login", req.url);
    const response = NextResponse.redirect(loginUrl);
    clearSessionCookies(response, req);
    return response;
  }

  // Force redirect to HTTPS in production
  if (process.env.NODE_ENV === "production") {
    const xForwardedProto = req.headers.get("x-forwarded-proto");
    const isHttp = req.nextUrl.protocol === "http:" || xForwardedProto === "http";
    if (isHttp) {
      const secureUrl = new URL(req.url);
      secureUrl.protocol = "https:";
      return NextResponse.redirect(secureUrl.toString(), 301);
    }
  }

  // Protect all /admin/* routes
  if (pathname.startsWith("/admin")) {
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect authenticated users away from login page
  if (pathname === "/login" && session) {
    const adminUrl = new URL("/admin/dashboard", req.url);
    return NextResponse.redirect(adminUrl);
  }

  return NextResponse.next();
};

export default auth(middlewareCallback);

// Matcher excludes static assets and Next.js internals automatically
export const config = {
  matcher: ["/admin/:path*", "/login", "/signup", "/verify-email"],
};
