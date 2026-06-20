import { SignerPoolManager } from "@/components/signers/SignerPoolManager";
import { getSignerManagementPageData } from "@/lib/signer-management";

export default async function SignersPreviewPage() {
  const data = await getSignerManagementPageData();

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Paymaster Admin Preview
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Keypool Management</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Preview route for the signer pool status interface.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <SignerPoolManager signers={data.signers} addEnabled={false} />
      </div>
    </main>
  );
}
