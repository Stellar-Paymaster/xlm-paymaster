import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div
        className="w-full max-w-md space-y-6 rounded-3xl border border-border/50 bg-white/70 p-8 shadow-sm"
        role="status"
        aria-busy="true"
        aria-label="Loading sign-in"
        data-testid="login-skeleton"
      >
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-10 w-10 rounded-full" label="Loading logo" />
          <Skeleton className="mx-auto h-6 w-40" label="Loading heading" />
          <Skeleton className="mx-auto h-3 w-56" label="Loading subheading" />
        </div>

        <div className="space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" label="Loading email field" />
          <Skeleton className="h-11 w-full rounded-xl" label="Loading password field" />
          <Skeleton className="h-11 w-full rounded-xl" label="Loading submit" />
        </div>
      </div>
    </div>
  );
}
