export const THEME_STORAGE_KEY = "fluid-admin-theme";

export const THEME_PREFERENCES = [
  "system",
  "light",
  "dark",
  "high-contrast",
] as const;

export const RESOLVED_THEMES = ["light", "dark", "high-contrast"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

export interface ThemeOption {
  description: string;
  label: string;
  preview: ResolvedTheme;
  value: ThemePreference;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = "light";

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: "system",
    label: "System",
    description: "Match the device appearance automatically.",
    preview: "light",
  },
  {
    value: "light",
    label: "Light",
    description: "Bright dashboard surfaces for everyday operations.",
    preview: "light",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-glare contrast for low-light workstations.",
    preview: "dark",
  },
  {
    value: "high-contrast",
    label: "High contrast",
    description: "Maximum separation for accessible environments.",
    preview: "high-contrast",
  },
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function sanitizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

export function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return RESOLVED_THEMES.includes(value as ResolvedTheme);
}

export function sanitizeResolvedTheme(value: unknown): ResolvedTheme {
  return isResolvedTheme(value) ? value : DEFAULT_RESOLVED_THEME;
}

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }

  return sanitizeResolvedTheme(preference);
}

export function getThemeOption(value: ThemePreference): ThemeOption {
  return (
    THEME_OPTIONS.find((option) => option.value === value) ??
    THEME_OPTIONS[0]
  );
}

export function describeThemePreference(
  preference: ThemePreference,
  resolvedTheme: ResolvedTheme,
): string {
  if (preference === "system") {
    return `System (${getThemeOption(resolvedTheme).label})`;
  }

  return getThemeOption(preference).label;
}
