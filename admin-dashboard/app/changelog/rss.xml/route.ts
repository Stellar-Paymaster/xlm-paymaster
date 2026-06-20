import RSS from "rss";
import { getGitHubReleases } from "@/lib/github";
import { getPortalLinks } from "@/lib/portal-links";

export async function GET() {
  const releases = await getGitHubReleases();
  const { siteUrl } = getPortalLinks();

  const feed = new RSS({
    title: "Paymaster Changelog",
    description: "Latest updates and improvements for Paymaster",
    site_url: siteUrl,
    feed_url: `${siteUrl}/changelog/rss.xml`,
    language: "en",
    pubDate: new Date().toUTCString(),
    ttl: 60,
  });

  releases.forEach((release) => {
    feed.item({
      title: release.name || release.tag_name,
      description: release.body,
      url: `${siteUrl}/changelog#${release.tag_name}`,
      guid: release.tag_name,
      date: release.published_at,
      author: release.author.login,
    });
  });

  return new Response(feed.xml({ indent: true }), {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1200",
    },
  });
}
