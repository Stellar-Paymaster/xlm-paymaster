"use client";

import { AiSupportWidget } from "@/components/dashboard/AiSupportWidget";
import { QueryProvider } from "@/providers/QueryProvider";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
        {children}
        <AiSupportWidget />
      </SessionProvider>
    </QueryProvider>
  );
}
