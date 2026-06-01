import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { AdminRole } from "./lib/permissions";

declare module "next-auth" {
  interface User {
    role?: string;
    adminJwt?: string;
  }
  interface Session {
    user: {
      email?: string | null;
      role?: string;
      adminJwt?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    adminJwt?: string;
    iat?: number;
    exp?: number;
  }
}

const JWT_ROTATION_INTERVAL = 60 * 60; // Rotate every 1 hour
const JWT_EXPIRATION = 8 * 60 * 60; // 8-hour session max age

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        // 1. Try DB-based admin users via the backend login endpoint
        const serverUrl = process.env.FLUID_SERVER_URL;
        const adminToken = process.env.FLUID_ADMIN_TOKEN;

        if (serverUrl && adminToken) {
          try {
            const resp = await fetch(`${serverUrl}/admin/auth/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            if (resp.ok) {
              const data = await resp.json();
              return {
                id: email,
                email,
                role: data.role as AdminRole,
                adminJwt: data.token,
              };
            }
          } catch {
            // Backend unreachable — fall through to env-var auth
          }
        }

        // 2. Env-var fallback (single-admin / bootstrap deployments)
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminPasswordHash) return null;

        const emailMatch = await new Promise<boolean>((resolve) => {
          const isEqual = email === adminEmail;
          setTimeout(() => resolve(isEqual), Math.random() * 10);
        });
        if (!emailMatch) return null;

        const passwordMatch = await bcrypt.compare(password, adminPasswordHash);
        if (!passwordMatch) return null;

        return { id: "env-admin", email: adminEmail, role: "SUPER_ADMIN" };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: JWT_EXPIRATION },
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      const now = Math.floor(Date.now() / 1000);

      if (user) {
        // Initial sign-in
        token.role = user.role;
        token.adminJwt = user.adminJwt;
        token.iat = now;
        token.exp = now + JWT_EXPIRATION;
      } else if (token.iat && token.exp) {
        // Token rotation: refresh if half the rotation interval has passed
        const issuedAt = token.iat;
        const timeSinceIssue = now - issuedAt;

        if (timeSinceIssue > JWT_ROTATION_INTERVAL) {
          // Rotate the token by updating issued/expiry times
          token.iat = now;
          token.exp = now + JWT_EXPIRATION;

          // If using backend admin JWT, attempt to refresh it
          if (token.adminJwt && typeof token.adminJwt === "string") {
            const serverUrl = process.env.FLUID_SERVER_URL;
            if (serverUrl) {
              try {
                const resp = await fetch(
                  `${serverUrl}/admin/auth/refresh`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token.adminJwt}`,
                    },
                  }
                );
                if (resp.ok) {
                  const data = await resp.json();
                  token.adminJwt = data.token;
                }
              } catch {
                // Silent fail - keep existing token
              }
            }
          }
        }
      }

      return token;
    },
    session: async ({ session, token }) => {
      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (token.exp && now > token.exp) {
        return null; // Expired session
      }

      if (session.user) {
        session.user.role = token.role as string;
        session.user.adminJwt = token.adminJwt as string | undefined;
      }
      return session;
    },
    redirect: async ({ url, baseUrl }) => {
      // Redirect to login if session invalid
      if (url === "/login" || url.startsWith("/login")) {
        return url;
      }
      return baseUrl;
    },
  },
  pages: { signIn: "/login" },
});
