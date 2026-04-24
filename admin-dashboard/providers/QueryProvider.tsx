"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { createQueryClient } from "./queryConfig";

export {
  QUERY_DEFAULTS,
  createQueryClient,
  isHttpError,
  retryDelay,
  shouldRetry,
} from "./queryConfig";
export type { HttpErrorLike } from "./queryConfig";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState lazily instantiates the client once per provider mount. The
  // provider lives at the root of the tree so in practice this is a singleton
  // for the user's session, while still staying SSR-safe.
  const [client] = useState(() => createQueryClient());

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
