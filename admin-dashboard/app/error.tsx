"use client";

import { ErrorBoundaryScreen } from "@/components/feedback/ErrorBoundaryScreen";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryScreen error={error} reset={reset} scope="the Fluid app" />;
}