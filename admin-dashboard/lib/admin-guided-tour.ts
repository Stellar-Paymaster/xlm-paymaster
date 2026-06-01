export type AdminGuidedTourStepId =
  | "create-key"
  | "manage-signer-pool"
  | "billing-config";

export interface AdminGuidedTourStep {
  id: AdminGuidedTourStepId;
  title: string;
  description: string;
  target: string;
}

export interface TourViewport {
  width: number;
  height: number;
}

export interface TourCardPosition {
  top: number;
  left: number;
  placement: "top" | "bottom" | "center";
}

export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export const ADMIN_GUIDED_TOUR_VERSION = 1;
export const ADMIN_GUIDED_TOUR_STORAGE_PREFIX = "fluid-admin-guided-tour";

const TOUR_CARD_WIDTH = 360;
const TOUR_CARD_HEIGHT = 248;
const VIEWPORT_MARGIN = 16;

export function getAdminGuidedTourStorageKey(userKey: string) {
  const normalizedKey = userKey.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");

  return `${ADMIN_GUIDED_TOUR_STORAGE_PREFIX}:v${ADMIN_GUIDED_TOUR_VERSION}:${normalizedKey || "anonymous"}`;
}

export function getAdminGuidedTourSteps(): AdminGuidedTourStep[] {
  return [
    {
      id: "create-key",
      title: "Create a new API key",
      description:
        "Open API Key Management first to create, scope, or revoke access keys before you wire a tenant into production.",
      target: '[data-tour-step="create-key"]',
    },
    {
      id: "manage-signer-pool",
      title: "Manage the signer pool",
      description:
        "Review signer balance, add new fee payers, and remove stale keys before transaction volume grows.",
      target: '[data-tour-step="manage-signer-pool"]',
    },
    {
      id: "billing-config",
      title: "Configure billing and quota",
      description:
        "Use Billing & Quota to top up balance, review payment history, and keep sponsorship available.",
      target: '[data-tour-step="billing-config"]',
    },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getAdminTourCardPosition(
  targetRect: RectLike | null,
  viewport: TourViewport,
): TourCardPosition {
  if (!targetRect) {
    return {
      top: 88,
      left: clamp(
        (viewport.width - TOUR_CARD_WIDTH) / 2,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, viewport.width - TOUR_CARD_WIDTH - VIEWPORT_MARGIN),
      ),
      placement: "center",
    };
  }

  const spaceAbove = targetRect.top;
  const spaceBelow = viewport.height - targetRect.bottom;
  const placeBelow = spaceBelow >= TOUR_CARD_HEIGHT + 28 || spaceBelow >= spaceAbove;
  const placement: TourCardPosition["placement"] = placeBelow ? "bottom" : "top";
  const top = placeBelow
    ? targetRect.bottom + 20
    : Math.max(VIEWPORT_MARGIN, targetRect.top - TOUR_CARD_HEIGHT - 20);
  const left = clamp(
    targetRect.left + targetRect.width / 2 - TOUR_CARD_WIDTH / 2,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewport.width - TOUR_CARD_WIDTH - VIEWPORT_MARGIN),
  );

  return { top, left, placement };
}
