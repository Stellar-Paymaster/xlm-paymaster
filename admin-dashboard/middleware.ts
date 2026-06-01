import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const middlewareCallback = (req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

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
