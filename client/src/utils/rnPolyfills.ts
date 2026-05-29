/**
 * React Native Polyfills for Fluid SDK
 *
 * Import this file at the top of your React Native app
 * BEFORE importing the Fluid SDK:
 *
 * import 'react-native-get-random-values';
 * import { FluidClient } from '@fluid-dev/sdk/react-native';
 */

/**
 * Safe localStorage replacement for React Native.
 * Falls back to an in-memory store when localStorage is unavailable.
 */
const memoryStore: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(key);
      }
    } catch {}
    return memoryStore[key] ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
        return;
      }
    } catch {}
    memoryStore[key] = value;
  },

  removeItem(key: string): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
        return;
      }
    } catch {}
    delete memoryStore[key];
  },
};

/**
 * Safe fetch sender — works in React Native, browser, and Node.
 * Replaces navigator.sendBeacon and Image pixel ping.
 */
export function safeSend(url: string, data: unknown): void {
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      navigator.sendBeacon(url, blob);
      return;
    }

    if (typeof fetch !== "undefined") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch(() => {});
      return;
    }
  } catch {
    // Silently fail — telemetry must never block SDK functionality
  }
}

/**
 * Safe domain getter — returns hostname in browser,
 * 'react-native' in RN, 'server-side' in Node.
 */
export function getSafeDomain(): string {
  try {
    if (typeof window !== "undefined" && window.location?.hostname) {
      return window.location.hostname;
    }
    if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
      return "react-native";
    }
  } catch {}
  return "server-side";
}

/**
 * Returns true if the current environment is React Native.
 */
export function isReactNative(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.product === "ReactNative"
  );
}