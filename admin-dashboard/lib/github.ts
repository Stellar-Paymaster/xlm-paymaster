export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  author: {
    login: string;
    avatar_url: string;
  };
}

export async function getGitHubReleases(): Promise<GitHubRelease[]> {
  const repo = "augustine00z/stellar-paymaster";
  const url = `https://api.github.com/repos/${repo}/releases`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Paymaster-Changelog",
      },
    });

    if (!res.ok) {
      console.error(`Failed to fetch releases from ${url}: ${res.statusText}`);
      return [];
    }

    return await res.json();
  } catch (error) {
    console.error("Error fetching GitHub releases:", error);
    return [];
  }
}
