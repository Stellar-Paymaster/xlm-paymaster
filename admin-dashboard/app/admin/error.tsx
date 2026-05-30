"use client";

import { ErrorBoundaryScreen } from "@/components/feedback/ErrorBoundaryScreen";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryScreen error={error} reset={reset} scope="the admin dashboard" />;
}