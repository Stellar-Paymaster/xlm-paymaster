import assert from "node:assert/strict";
import test from "node:test";
import { getPortalLinks } from "./portal-links.ts";

function withPortalEnv(
  overrides: Partial<NodeJS.ProcessEnv>,
  callback: () => void,
) {
  const originalEnv = process.env;
  process.env = { ...originalEnv, ...overrides };

  try {
    callback();
  } finally {
    process.env = originalEnv;
  }
}

test("getPortalLinks returns defaults when public variables are missing", () => {
  withPortalEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      NEXT_PUBLIC_DOCS_URL: undefined,
      NEXT_PUBLIC_GITHUB_URL: undefined,
      NEXT_PUBLIC_DISCORD_URL: undefined,
      NEXT_PUBLIC_HELP_CENTER_URL: undefined,
      NEXT_PUBLIC_SUPPORT_URL: undefined,
    },
    () => {
      const links = getPortalLinks();

      assert.equal(links.siteUrl, "http://localhost:3000");
      assert.equal(links.docs, "https://docs.fluid.dev");
      assert.equal(links.github, "https://github.com/fluid-org/fluid");
      assert.equal(links.discord, "https://discord.gg/fluid");
      assert.equal(links.helpCenter, "https://help.fluid.dev");
      assert.equal(links.support, "https://support.fluid.dev/tickets");
    },
  );
});

test("getPortalLinks returns configured public variables", () => {
  withPortalEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://custom-site.com",
      NEXT_PUBLIC_DOCS_URL: "https://custom-docs.com",
      NEXT_PUBLIC_GITHUB_URL: "https://custom-github.com",
      NEXT_PUBLIC_DISCORD_URL: "https://custom-discord.com",
      NEXT_PUBLIC_HELP_CENTER_URL: "https://custom-help.com",
      NEXT_PUBLIC_SUPPORT_URL: "https://custom-support.com",
    },
    () => {
      const links = getPortalLinks();

      assert.equal(links.siteUrl, "https://custom-site.com");
      assert.equal(links.docs, "https://custom-docs.com");
      assert.equal(links.github, "https://custom-github.com");
      assert.equal(links.discord, "https://custom-discord.com");
      assert.equal(links.helpCenter, "https://custom-help.com");
      assert.equal(links.support, "https://custom-support.com");
    },
  );
});
