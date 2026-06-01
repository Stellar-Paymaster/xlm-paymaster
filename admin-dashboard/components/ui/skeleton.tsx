import * as React from "react";

import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Accessible label announced to assistive tech while content is loading.
   * Defaults to "Loading" — override when a more specific label helps
   * (e.g. "Loading transactions").
   */
  label?: string;
}

/**
 * Dimensionless loading placeholder.
 *
 * Consumers supply the size via className (h-*, w-*, rounded-*). The primitive
 * keeps the dimensional decision with the caller so composite skeletons can
 * match the real component's geometry byte-for-byte — which is what kills
 * layout shift.
 *
 * Accessibility: emits role="status" + aria-busy so screen readers announce
 * the load state; honours prefers-reduced-motion by swapping `animate-pulse`
 * for a plain muted surface (see .motion-safe: wrapper below).
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton(
    { className, label = "Loading", children, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="status"
        aria-busy="true"
        aria-live="polite"
        className={cn(
          "relative overflow-hidden rounded-md bg-muted/60",
          "motion-safe:animate-pulse",
          className,
        )}
        {...props}
      >
        <span className="sr-only">{label}</span>
        {children}
      </div>
    );
  },
);

Skeleton.displayName = "Skeleton";
