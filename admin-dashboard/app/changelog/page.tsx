import { getGitHubReleases } from "@/lib/github";
import { ChangelogContent } from "./ChangelogContent";

export default async function ChangelogPage() {
  const releases = await getGitHubReleases();

  return (
    <main className="min-h-screen bg-zinc-50 ">
      <ChangelogContent releases={releases} />
    </main>
  );
}
