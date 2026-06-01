import { ApiKeysTableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              <div className="h-8 w-60 rounded-md bg-muted/60 motion-safe:animate-pulse" />
              <div className="h-3 w-80 max-w-full rounded-md bg-muted/60 motion-safe:animate-pulse" />
            </div>
            <div className="h-12 w-48 rounded-2xl bg-muted/60 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ApiKeysTableSkeleton rows={8} />
      </div>
    </main>
  );
}
