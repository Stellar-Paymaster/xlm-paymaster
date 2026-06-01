import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSandboxPageData } from "@/lib/sandbox-data";
import { SandboxPanel } from "@/components/dashboard/SandboxPanel";
import { SandboxTransactionBuilder } from "@/components/dashboard/SandboxTransactionBuilder";

export default async function AdminSandboxPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const { keys, sandboxHorizonUrl, sandboxRateLimitMax, source } =
    await getSandboxPageData();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 glass  sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                Fluid Admin
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tighter text-foreground">
                Sandbox Environment
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {source === "live"
                  ? "Live server data"
                  : "Sample data — server unreachable"}
              </p>
            </div>
            <Link
              href="/admin/dashboard"
              className="rounded-full border border-border/50 glass  px-5 py-2 text-sm font-bold text-foreground transition hover:shadow-lg hover:-translate-x-1"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <SandboxPanel
          initialKeys={keys}
          sandboxHorizonUrl={sandboxHorizonUrl}
          sandboxRateLimitMax={sandboxRateLimitMax}
        />
        <SandboxTransactionBuilder />
      </main>
    </div>
  );
}
