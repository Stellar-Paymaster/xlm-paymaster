import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { authConfig } from "../auth.ts";
import { middlewareCallback } from "../middleware.ts";

test("NextAuth configuration session cookie matches env", () => {
  const isProd = process.env.NODE_ENV === "production";
  assert.equal(authConfig.useSecureCookies, isProd);
  
  const sessionToken = authConfig.cookies?.sessionToken;
  assert.ok(sessionToken);
  assert.equal(sessionToken.options.secure, isProd);
  if (isProd) {
    assert.ok(sessionToken.name.startsWith("__Secure-"));
  } else {
    assert.ok(!sessionToken.name.startsWith("__Secure-"));
  }
});

test("middlewareCallback redirects according to environment", () => {
  const origNodeEnv = process.env.NODE_ENV;

  try {
    // 1. Production HTTPS redirect check
    process.env.NODE_ENV = "production";
    const mockReqProd = {
      nextUrl: {
        pathname: "/admin/dashboard",
        protocol: "http:",
      },
      url: "http://example.com/admin/dashboard",
      headers: {
        get: (name: string) => {
          if (name === "x-forwarded-proto") return "http";
          return null;
        }
      },
      auth: null,
    } as any;

    const originalRedirect = NextResponse.redirect;
    let redirectedTo: string | null = null;
    let redirectStatus: number | null = null;
    
    NextResponse.redirect = (url: string | URL, status?: number) => {
      redirectedTo = url.toString();
      redirectStatus = status || null;
      return { type: "redirect" } as any;
    };

    try {
      const res = middlewareCallback(mockReqProd);
      assert.ok(res);
      assert.equal(redirectedTo, "https://example.com/admin/dashboard");
      assert.equal(redirectStatus, 301);
    } finally {
      NextResponse.redirect = originalRedirect;
    }

    // 2. Development HTTP validation check (should not redirect)
    process.env.NODE_ENV = "development";
    const mockReqDev = {
      nextUrl: {
        pathname: "/admin/dashboard",
        protocol: "http:",
      },
      url: "http://example.com/admin/dashboard",
      headers: {
        get: (name: string) => null,
      },
      auth: null,
    } as any;

    let redirected = false;
    NextResponse.redirect = (url: string | URL, status?: number) => {
      redirected = true;
      return { type: "redirect" } as any;
    };

    try {
      const res = middlewareCallback(mockReqDev);
      assert.ok(!redirected);
    } finally {
      NextResponse.redirect = originalRedirect;
    }

  } finally {
    process.env.NODE_ENV = origNodeEnv;
  }
});
export {};
