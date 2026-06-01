/**
 * Public developer portal URLs (NEXT_PUBLIC_* — see .env.example).
 * Safe to use in server and client components.
 */
export function getPortalLinks() {
  return {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    docs: process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.fluid.dev",
    github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/fluid-org/fluid",
    discord: process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/fluid",
    helpCenter: process.env.NEXT_PUBLIC_HELP_CENTER_URL ?? "https://help.fluid.dev",
    support: process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://support.fluid.dev/tickets",
  };
}
