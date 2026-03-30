import type {
  TransactionStatus,
  WebhookDeliveryStatus,
} from "@/components/dashboard/types";

type BadgeTone = "green" | "amber" | "slate" | "red";
type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

function getTone(
  status: TransactionStatus | WebhookDeliveryStatus | "active" | "inactive",
): BadgeTone {
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

export function StatusBadge({
  status,
  variant,
}: {
  status: TransactionStatus | WebhookDeliveryStatus | "active" | "inactive";
  variant?: BadgeVariant;
}) {
  const tone =
    variant === "success"
      ? "green"
      : variant === "warning"
        ? "amber"
        : variant === "error"
          ? "red"
          : variant === "info"
            ? "slate"
            : getTone(status);
  const toneClassName = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${toneClassName}`}
    >
      {status}
    </span>
  );
}
