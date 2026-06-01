"use client";

import type { TransactionStatus, WebhookDeliveryStatus } from "@/components/dashboard/types";
import { Pulse } from "@/components/ui/motion";

type BadgeTone = "green" | "amber" | "slate" | "red";

type AllowedStatus = TransactionStatus | WebhookDeliveryStatus | "active" | "inactive";

function getTone(status: AllowedStatus): BadgeTone {
  switch (status) {
    case "success":
    case "active":
      return "green";
    case "pending":
    case "submitted":
    case "retrying":
      return "amber";
    case "failed":
      return "red";
    default:
      return "slate";
  }
}

function isPendingStatus(status: AllowedStatus): boolean {
  return status === "pending" || status === "submitted" || status === "retrying";
}

export function StatusBadge({
  status,
}: {
  status: AllowedStatus;
}) {
  const toneClassName = {
    green:
      "bg-emerald-50 text-emerald-700 ring-emerald-200   ",
    amber:
      "bg-amber-50 text-amber-700 ring-amber-200   ",
    slate:
      "bg-slate-100 text-slate-700 ring-slate-200   ",
    red: "bg-rose-50 text-rose-700 ring-rose-200   ",
  }[getTone(status)];

  const isPending = isPendingStatus(status);

  return (
    <Pulse active={isPending}>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset transition-all duration-200 ${toneClassName}`}
      >
        {isPending && (
          <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        )}
        {status}
      </span>
    </Pulse>
  );
}