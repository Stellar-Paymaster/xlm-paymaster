/**
 * Public developer portal URLs (NEXT_PUBLIC_* — see .env.example).
 * Safe to use in server and client components.
 */
export function getPortalLinks() {
  return {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    docs: process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.paymaster.dev",
    github: process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/paymaster-org/paymaster",
    discord: process.env.NEXT_PUBLIC_DISCORD_URL ?? "https://discord.gg/paymaster",
    helpCenter: process.env.NEXT_PUBLIC_HELP_CENTER_URL ?? "https://help.paymaster.dev",
    support: process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://support.paymaster.dev/tickets",
  };
}
