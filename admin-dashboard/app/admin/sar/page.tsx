import Link from "next/link";
import { auth } from "@/auth";
import { SARTable } from "@/components/dashboard/SARTable";
import { getSARPageData } from "@/lib/sar-data";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SARPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const resolved = await searchParams;
  const statusFilter = typeof resolved.status === "string" ? resolved.status : undefined;

  const pageData = await getSARPageData(statusFilter);

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border/50 glass  sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Fluid Admin — Compliance
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tighter text-foreground">
                Suspicious Activity Reports
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Transactions flagged by automated SAR rules. Review each report and mark it
                as confirmed suspicious or a false positive.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-border/50 glass  px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <div className="text-foreground">{session?.user?.email}</div>
                <div className="mt-0.5">{pageData.source === "live" ? "Live server data" : "Sample data"}</div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-border/50 glass  px-6 text-sm font-black text-foreground transition hover:shadow-lg hover:-translate-x-1"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <SARTable data={pageData} />
      </div>
    </main>
  );
}
