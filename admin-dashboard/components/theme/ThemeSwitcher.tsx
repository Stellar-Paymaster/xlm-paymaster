"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  THEME_OPTIONS,
  describeThemePreference,
  getThemeOption,
  sanitizeResolvedTheme,
  sanitizeThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const preference = sanitizeThemePreference(mounted ? theme : undefined);
  const activeResolvedTheme = sanitizeResolvedTheme(resolvedTheme);
  const triggerLabel = mounted
    ? describeThemePreference(preference, activeResolvedTheme)
    : "Appearance";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Appearance settings. Current selection: ${triggerLabel}.`}
          className="min-h-9 rounded-full border-border/70 px-3"
          size="sm"
          variant="outline"
        >
          <span className="sr-only font-semibold sm:not-sr-only">Appearance</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {mounted ? triggerLabel : "Loading"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] space-y-3 border-border/70 p-3">
        <div className="space-y-1 border-b border-border/70 pb-3">
          <p className="text-sm font-semibold text-foreground">Appearance</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Restore dark mode and switch to a high-contrast palette when visibility needs to take priority.
          </p>
        </div>

        <div aria-label="Theme options" className="space-y-2" role="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const isSelected = preference === option.value;
            const previewLabel =
              option.value === "system"
                ? `Currently following ${getThemeOption(activeResolvedTheme).label.toLowerCase()}.`
                : `Preview ${getThemeOption(option.preview).label.toLowerCase()} palette.`;

            return (
              <button
                key={option.value}
                aria-checked={isSelected}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary/40 bg-primary/10 shadow-sm"
                    : "border-border/70 bg-card hover:bg-muted/50",
                )}
                onClick={() => setTheme(option.value)}
                role="radio"
                type="button"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{option.label}</span>
                    {option.value === "high-contrast" ? (
                      <span className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Accessibility
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{option.description}</p>
                  <p className="text-[11px] font-medium text-muted-foreground">{previewLabel}</p>
                </div>
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/70 bg-background text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
