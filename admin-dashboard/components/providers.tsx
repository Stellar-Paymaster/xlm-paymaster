"use client";

import { AiSupportWidget } from "@/components/dashboard/AiSupportWidget";
import { SessionTimeoutWarning } from "@/components/dashboard/SessionTimeoutWarning";
import { RESOLVED_THEMES, THEME_STORAGE_KEY } from "@/lib/theme";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
        <SessionTimeoutWarning />
      </ThemeProvider>
    </SessionProvider>
  );
}
