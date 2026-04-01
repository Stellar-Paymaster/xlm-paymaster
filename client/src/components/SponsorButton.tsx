"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useFeeBump, UseFeeBumpResult } from "../hooks/useFeeBump";
import { FluidClient, FeeBumpResponse } from "../FluidClient";

// ============================================================================
// Types
// ============================================================================

export type SponsorButtonState = "idle" | "loading" | "success" | "error";

export interface SponsorTransactionActionProps {
  /**
   * The FluidClient instance to use for fee-bump requests.
   */
  client: FluidClient;

  /**
   * The transaction XDR string or an object with a toXDR() method.
   */
  transaction: string | { toXDR: () => string };

  /**
   * Whether to automatically submit the transaction after fee-bumping.
   * @default true
   */
  submit?: boolean;

  /**
   * Callback fired when the transaction is successfully sponsored (and optionally submitted).
   */
  onSuccess?: (response: FeeBumpResponse) => void;

  /**
   * Callback fired when an error occurs during sponsorship.
   */
  onError?: (error: Error) => void;

  /**
   * Custom class names for styling (Tailwind compatible).
   */
  className?: string;

  /**
   * Custom class names for specific states.
   */
  classNames?: {
    idle?: string;
    loading?: string;
    success?: string;
    error?: string;
  };

  /**
   * Custom button text for each state.
   */
  labels?: {
    idle?: string;
    loading?: string;
    success?: string;
    error?: string;
  };

  /**
   * Whether the button is disabled.
   * @default false
   */
  disabled?: boolean;

  /**
   * Duration in ms to show success/error state before returning to idle.
   * Set to 0 to never auto-reset.
   * @default 2500
   */
  resetDelay?: number;

  /**
   * Display mode for feedback.
   * - "inline": Shows status text within the button
   * - "toast": Fires toast-style callbacks (you handle the UI)
   * @default "inline"
   */
  feedbackMode?: "inline" | "toast";

  /**
   * Callback to show a toast notification (when feedbackMode is "toast").
   */
  onToast?: (message: string, type: "success" | "error") => void;

  /**
   * Custom spinner component to render during loading state.
   */
  spinnerComponent?: React.ReactNode;

  /**
   * Custom success icon component.
   */
  successIcon?: React.ReactNode;

  /**
   * Custom error icon component.
   */
  errorIcon?: React.ReactNode;

  /**
   * Additional props to spread onto the button element.
   */
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;

  /**
   * Children to render inside the button (overrides default content).
   */
  children?: React.ReactNode;
}

// ============================================================================
// Default Icons
// ============================================================================

const DefaultSpinner: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`animate-spin h-5 w-5 ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const DefaultSuccessIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`h-5 w-5 ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
);

const DefaultErrorIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`h-5 w-5 ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      clipRule="evenodd"
    />
  </svg>
);

// ============================================================================
// Default Styles
// ============================================================================

const DEFAULT_LABELS = {
  idle: "Sponsor Transaction",
  loading: "Processing...",
  success: "Sponsored!",
  error: "Failed",
};

const BASE_STYLES = [
  "inline-flex",
  "items-center",
  "justify-center",
  "gap-2",
  "px-6",
  "py-3",
  "font-semibold",
  "text-sm",
  "rounded-lg",
  "transition-all",
  "duration-200",
  "ease-in-out",
  "focus:outline-none",
  "focus:ring-2",
  "focus:ring-offset-2",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

const STATE_STYLES: Record<SponsorButtonState, string> = {
  idle: "bg-gradient-to-r from-sky-500 to-cyan-400 text-white hover:from-sky-600 hover:to-cyan-500 focus:ring-sky-500 shadow-lg hover:shadow-xl",
  loading: "bg-gradient-to-r from-sky-500 to-cyan-400 text-white cursor-wait shadow-lg",
  success: "bg-gradient-to-r from-emerald-500 to-teal-400 text-white focus:ring-emerald-500 shadow-lg",
  error: "bg-gradient-to-r from-rose-500 to-red-400 text-white focus:ring-rose-500 shadow-lg",
};

// ============================================================================
// Component
// ============================================================================

/**
 * A premium, customizable React button component that encapsulates the entire
 * "Sponsor + Submit" flow for Stellar fee-bump transactions using Fluid.
 *
 * @example
 * ```tsx
 * <SponsorTransactionAction
 *   client={fluidClient}
 *   transaction={signedTxXdr}
 *   onSuccess={(response) => console.log("Sponsored!", response.hash)}
 *   onError={(error) => console.error("Failed:", error.message)}
 * />
 * ```
 */
export const SponsorTransactionAction: React.FC<SponsorTransactionActionProps> = ({
  client,
  transaction,
  submit = true,
  onSuccess,
  onError,
  className = "",
  classNames = {},
  labels = {},
  disabled = false,
  resetDelay = 2500,
  feedbackMode = "inline",
  onToast,
  spinnerComponent,
  successIcon,
  errorIcon,
  buttonProps = {},
  children,
}) => {
  const [state, setState] = useState<SponsorButtonState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { requestFeeBump, isLoading } = useFeeBump(client);

  // Merge labels with defaults
  const mergedLabels = { ...DEFAULT_LABELS, ...labels };

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  // Reset to idle after success/error
  const scheduleReset = useCallback(() => {
    if (resetDelay > 0) {
      resetTimeoutRef.current = setTimeout(() => {
        setState("idle");
        setErrorMessage(null);
      }, resetDelay);
    }
  }, [resetDelay]);

  const handleClick = useCallback(async () => {
    if (state === "loading" || disabled) return;

    // Clear any pending reset
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    setState("loading");
    setErrorMessage(null);

    try {
      const txXdr = typeof transaction === "string" ? transaction : transaction.toXDR();
      const response = await requestFeeBump(txXdr, submit);

      setState("success");

      if (feedbackMode === "toast" && onToast) {
        onToast(
          response.hash
            ? `Transaction sponsored! Hash: ${response.hash.slice(0, 8)}...`
            : "Transaction sponsored successfully!",
          "success"
        );
      }

      onSuccess?.(response);
      scheduleReset();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error occurred");
      
      setState("error");
      setErrorMessage(error.message);

      if (feedbackMode === "toast" && onToast) {
        onToast(`Sponsorship failed: ${error.message}`, "error");
      }

      onError?.(error);
      scheduleReset();
    }
  }, [
    state,
    disabled,
    transaction,
    submit,
    requestFeeBump,
    onSuccess,
    onError,
    feedbackMode,
    onToast,
    scheduleReset,
  ]);

  // Compute classes
  const stateClassName = classNames[state] || STATE_STYLES[state];
  const combinedClassName = `${BASE_STYLES} ${stateClassName} ${className}`.trim();

  // Render content based on state
  const renderContent = () => {
    if (children) return children;

    switch (state) {
      case "loading":
        return (
          <>
            {spinnerComponent || <DefaultSpinner />}
            <span>{mergedLabels.loading}</span>
          </>
        );
      case "success":
        return (
          <>
            {successIcon || <DefaultSuccessIcon />}
            <span>{mergedLabels.success}</span>
          </>
        );
      case "error":
        return (
          <>
            {errorIcon || <DefaultErrorIcon />}
            <span>{mergedLabels.error}</span>
          </>
        );
      default:
        return <span>{mergedLabels.idle}</span>;
    }
  };

  // ARIA attributes for accessibility
  const ariaAttributes = {
    "aria-busy": state === "loading",
    "aria-disabled": disabled || state === "loading",
    "aria-live": "polite" as const,
    "aria-label":
      state === "error" && errorMessage
        ? `${mergedLabels.error}: ${errorMessage}`
        : mergedLabels[state],
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "loading"}
      className={combinedClassName}
      {...ariaAttributes}
      {...buttonProps}
    >
      {renderContent()}
    </button>
  );
};

// ============================================================================
// Export aliases
// ============================================================================

export { SponsorTransactionAction as SponsorButton };
export default SponsorTransactionAction;