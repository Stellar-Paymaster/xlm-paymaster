"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { queryKeys } from "../lib/query-keys.ts";

export interface Notification {
  id: string;
  type: "low_balance" | "incident" | "info" | "warning" | "critical";
  title: string;
  message: string;
  read: boolean;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

// ─── Endpoint URL builders (pure, unit-testable) ────────────────────────────

export function notificationsListUrl(): string {
  return "/api/notifications";
}

export function markNotificationReadUrl(id: string): string {
  if (!id) throw new Error("notification id is required");
  return `/api/notifications/${encodeURIComponent(id)}/read`;
}

export function markAllNotificationsReadUrl(): string {
  return "/api/notifications/read-all";
}

// ─── HTTP error handling ────────────────────────────────────────────────────

export class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new HttpError(res.status, `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetches the notification list. Cached under the shared query key so SSE
 * pushes (handled in NotificationBell) can patch the cache directly via
 * queryClient.setQueryData without refetching.
 */
export function useNotificationsQuery(): UseQueryResult<Notification[]> {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async ({ signal }) => {
      const res = await fetch(notificationsListUrl(), {
        cache: "no-store",
        signal,
      });
      const data = await jsonOrThrow<NotificationsResponse>(res);
      return Array.isArray(data.notifications) ? data.notifications : [];
    },
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Marks a single notification as read. Optimistically updates the cached list
 * so the UI feels instant; the cache is re-synced from the server response on
 * settle. On error the optimistic update is rolled back.
 */
export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["notifications", "mark-read"],
    mutationFn: async (id: string) => {
      const res = await fetch(markNotificationReadUrl(id), {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new HttpError(res.status, `Mark-read failed with ${res.status}`);
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.list(),
      });
      const previous = queryClient.getQueryData<Notification[]>(
        queryKeys.notifications.list(),
      );
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.list(),
        (current) =>
          (current ?? []).map((notification) =>
            notification.id === id
              ? { ...notification, read: true }
              : notification,
          ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.list(),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.list(),
      });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["notifications", "mark-all-read"],
    mutationFn: async () => {
      const res = await fetch(markAllNotificationsReadUrl(), {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new HttpError(
          res.status,
          `Mark-all-read failed with ${res.status}`,
        );
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.list(),
      });
      const previous = queryClient.getQueryData<Notification[]>(
        queryKeys.notifications.list(),
      );
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.list(),
        (current) =>
          (current ?? []).map((notification) => ({
            ...notification,
            read: true,
          })),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.list(),
          context.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.list(),
      });
    },
  });
}
