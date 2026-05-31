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
  }
}

export const authConfig = {
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
  session: { strategy: "jwt" as const, maxAge: 8 * 60 * 60 },
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    jwt: async ({ token, user }: any) => {
      if (user) {
        token.role = user.role;
        token.adminJwt = user.adminJwt;
      }
      return token;
    },
    session: async ({ session, token }: any) => {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.adminJwt = token.adminJwt as string | undefined;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
