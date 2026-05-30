import { describe, it, expect, afterEach } from "vitest";

// The loader is a pure function; we stub process.env per test.
// This file is also executable with `node --import tsx/esm` for CI evidence
// when the root package.json conflict blocks esbuild-based runners.

const originalEnv = process.env.NEXT_PUBLIC_CDN_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_CDN_URL = originalEnv;
});

describe("cdnImageLoader", () => {
  async function load() {
    // Re-import each time so the env var is picked up fresh.
    const mod = await import("./cdn-image-loader");
    return mod.default;
  }

  it("prepends CDN base URL with width and quality params", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com";
    const loader = await load();
    expect(loader({ src: "/logo.png", width: 800, quality: 90 })).toBe(
      "https://cdn.example.com/logo.png?w=800&q=90",
    );
  });

  it("uses default quality of 75 when omitted", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com";
    const loader = await load();
    expect(loader({ src: "/icon.svg", width: 32 })).toBe(
      "https://cdn.example.com/icon.svg?w=32&q=75",
    );
  });

  it("strips trailing slash from CDN URL", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com/";
    const loader = await load();
    expect(loader({ src: "/img.webp", width: 400, quality: 80 })).toBe(
      "https://cdn.example.com/img.webp?w=400&q=80",
    );
  });

  it("handles src without leading slash", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com";
    const loader = await load();
    expect(loader({ src: "images/hero.jpg", width: 1200, quality: 85 })).toBe(
      "https://cdn.example.com/images/hero.jpg?w=1200&q=85",
    );
  });

  it("falls back to empty base when CDN URL is not set", async () => {
    process.env.NEXT_PUBLIC_CDN_URL = "";
    const loader = await load();
    expect(loader({ src: "/photo.jpg", width: 600, quality: 75 })).toBe(
      "/photo.jpg?w=600&q=75",
    );
  });
});
