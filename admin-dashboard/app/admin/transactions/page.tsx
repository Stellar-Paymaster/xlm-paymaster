import Link from "next/link";
import { auth } from "@/auth";
import { TransactionTable } from "@/components/dashboard/TransactionTable";
import { getTransactionHistoryPageData, parseTransactionHistoryQuery } from "@/lib/transaction-history";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const query = parseTransactionHistoryQuery(resolvedSearchParams);
  const transactionHistory = await getTransactionHistoryPageData(query);

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Paymaster Admin
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Fee-Bump Transactions</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Search, sort, and review transaction history across tenants.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">{session?.user?.email}</div>
                <div>{transactionHistory.source === "live" ? "Live server data" : "Sample audit data"}</div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <TransactionTable data={transactionHistory} />
      </div>
    </main>
  );
}
