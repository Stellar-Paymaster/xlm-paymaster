import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      role: string;
      ipAddress?: string;
    };
  }

  interface User {
    id: string;
    email: string;
    role: string;
    ipAddress?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    ipAddress?: string;
  }
}
