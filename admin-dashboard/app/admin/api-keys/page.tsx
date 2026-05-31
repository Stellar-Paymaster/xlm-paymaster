import { auth } from "@/auth";
import Link from "next/link";
import { ApiKeysTable } from "@/components/dashboard/ApiKeysTable";
import { ApiKeyUsageCharts } from "@/components/dashboard/ApiKeyUsageCharts";
import { getApiKeysPageData } from "@/lib/api-keys-data";
import { buildApiKeyUsageStats } from "@/lib/api-key-usage-data";

export default async function AdminApiKeysPage() {
  const session = await auth();
  const { keys, source, serverUrl, adminToken } = await getApiKeysPageData();
  const usageStats = buildApiKeyUsageStats(keys);

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border/50 bg-background/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Fluid Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-foreground">
                API Key Management
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Revoke keys immediately if a key is leaked or a dApp is abusive.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-border/50 bg-card px-4 py-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  {session?.user?.email}
                </div>
                <div>
                  {source === "live" ? "Live server data" : "Sample data"}
                </div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-border/50 bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <ApiKeysTable
          initialKeys={keys}
          serverUrl={serverUrl}
          adminToken={adminToken}
        />

        <section aria-labelledby="usage-charts-heading">
          <h2
            id="usage-charts-heading"
            className="mb-4 text-xl font-bold tracking-tight text-foreground"
          >
            Usage Analytics
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Per-key performance metrics including request counts, failure rates, and fee cost.
            {source === "sample" && (
              <span className="ml-2 font-medium text-amber-600">
                Showing sample data — connect a live server to see real metrics.
              </span>
            )}
          </p>
          <ApiKeyUsageCharts stats={usageStats} />
        </section>
      </div>
    </main>
  );
}
