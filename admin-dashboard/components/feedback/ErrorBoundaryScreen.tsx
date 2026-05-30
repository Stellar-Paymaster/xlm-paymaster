"use client";

import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  scope?: string;
}

export function ErrorBoundaryScreen({ error, reset, scope = "the page" }: ErrorBoundaryScreenProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200/80">
              Application error
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Something went wrong in {scope}.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              The dashboard hit an unexpected React error. Retry the route after the issue is cleared,
              or review the details below for debugging.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        </div>

        {showDetails ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-200">
            <p className="font-semibold text-white">Error details</p>
            <p className="mt-2 break-words text-slate-300">{error.message}</p>
            {error.digest ? <p className="mt-2 text-xs text-slate-400">Digest: {error.digest}</p> : null}
            {error.stack ? (
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs leading-5 text-slate-200">
                {error.stack}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}