"use client";

import { AiSupportWidget } from "@/components/dashboard/AiSupportWidget";
import { QueryProvider } from "@/providers/QueryProvider";
import { RESOLVED_THEMES, THEME_STORAGE_KEY } from "@/lib/theme";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
        storageKey={THEME_STORAGE_KEY}
        themes={[...RESOLVED_THEMES]}
      >
        {children}
        <AiSupportWidget />
      </ThemeProvider>
    </SessionProvider>
    </QueryProvider>
  );
}
