"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";
import {
  ADMIN_GUIDED_TOUR_VERSION,
  getAdminGuidedTourSteps,
  getAdminGuidedTourStorageKey,
  getAdminTourCardPosition,
  type AdminGuidedTourStep,
  type RectLike,
} from "@/lib/admin-guided-tour";

interface GuidedTourState {
  version: number;
  completed: boolean;
  stepId?: AdminGuidedTourStep["id"];
}

function readTourState(storageKey: string): GuidedTourState | null {
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<GuidedTourState>;
    if (parsed.version !== ADMIN_GUIDED_TOUR_VERSION) {
      return null;
    }

    return {
      version: ADMIN_GUIDED_TOUR_VERSION,
      completed: Boolean(parsed.completed),
      stepId: parsed.stepId,
    };
  } catch {
    return null;
  }
}

function writeTourState(storageKey: string, state: GuidedTourState) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore environments where storage is unavailable or locked down.
  }
}

function getTargetRect(targetSelector: string): RectLike | null {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) {
    return null;
  }

  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export function AdminGuidedTour({ userKey }: { userKey: string | null | undefined }) {
  const steps = useMemo(() => getAdminGuidedTourSteps(), []);
  const storageKey = useMemo(
    () => getAdminGuidedTourStorageKey(userKey ?? "anonymous"),
    [userKey],
  );
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectLike | null>(null);

  const currentStep = steps[activeIndex];

  useEffect(() => {
    setMounted(true);

    if (!userKey) {
      return;
    }

    const storedState = readTourState(storageKey);
    if (storedState?.completed) {
      setCompleted(true);
      return;
    }

    if (storedState?.stepId) {
      const savedIndex = steps.findIndex((step) => step.id === storedState.stepId);
      if (savedIndex >= 0) {
        setActiveIndex(savedIndex);
      }
    }

    setOpen(true);
  }, [storageKey, steps, userKey]);

  useEffect(() => {
    if (!mounted || !open || completed || !currentStep) {
      return;
    }

    writeTourState(storageKey, {
      version: ADMIN_GUIDED_TOUR_VERSION,
      completed: false,
      stepId: currentStep.id,
    });
  }, [completed, currentStep, mounted, open, storageKey]);

  useLayoutEffect(() => {
    if (!mounted || !open || !currentStep) {
      return;
    }

    let rafId = 0;
    const updateTarget = () => {
      const nextRect = getTargetRect(currentStep.target);
      setTargetRect(nextRect);

      if (nextRect) {
        const target = document.querySelector<HTMLElement>(currentStep.target);
        const prefersReducedMotion =
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        target?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "center",
        });
      }
    };

    updateTarget();
    rafId = window.requestAnimationFrame(updateTarget);

    const handleResize = () => updateTarget();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    const target = document.querySelector<HTMLElement>(currentStep.target);
    const resizeObserver =
      typeof window.ResizeObserver === "function" && target ? new window.ResizeObserver(handleResize) : null;
    if (target && resizeObserver) {
      resizeObserver.observe(target);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      resizeObserver?.disconnect();
    };
  }, [currentStep, mounted, open]);

  function closeTour() {
    writeTourState(storageKey, {
      version: ADMIN_GUIDED_TOUR_VERSION,
      completed: true,
      stepId: currentStep?.id,
    });
    setCompleted(true);
    setOpen(false);
  }

  function handleNext() {
    if (activeIndex === steps.length - 1) {
      closeTour();
      return;
    }

    setActiveIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function handleBack() {
    setActiveIndex((current) => Math.max(current - 1, 0));
  }

  if (!mounted || !open || completed || !currentStep) {
    return null;
  }

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const cardPosition = getAdminTourCardPosition(targetRect, viewport);
  const hasPrevious = activeIndex > 0;
  const isLastStep = activeIndex === steps.length - 1;
  const spotlightStyle = targetRect
    ? {
        top: targetRect.top - 8,
        left: targetRect.left - 8,
        width: targetRect.width + 16,
        height: targetRect.height + 16,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" aria-live="polite">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      {spotlightStyle ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[1.5rem] border border-cyan-300/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.68),0_0_0_6px_rgba(34,211,238,0.28)]"
          style={spotlightStyle}
        />
      ) : null}

      <div
        className="pointer-events-none absolute"
        style={{
          top: cardPosition.top,
          left: cardPosition.left,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-guided-tour-title"
          aria-describedby="admin-guided-tour-description"
          className="pointer-events-auto w-[min(360px,calc(100vw-2rem))] rounded-[1.75rem] border border-white/10 bg-slate-950 text-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                First-login guide
              </div>
              <h2 id="admin-guided-tour-title" className="mt-3 text-xl font-black tracking-tight">
                {currentStep.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeTour}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Close guided tour"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <p id="admin-guided-tour-description" className="text-sm leading-6 text-slate-300">
              {currentStep.description}
            </p>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-300">
              <span>
                Step {activeIndex + 1} of {steps.length}
              </span>
              {targetRect ? (
                <span className="text-cyan-200">Target visible</span>
              ) : (
                <span className="text-amber-200">Waiting for target</span>
              )}
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
              />
            </div>

            <p className="text-xs leading-5 text-slate-400">
              Use the highlighted action to move through setup, or continue with the buttons below.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={closeTour}
              className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={!hasPrevious}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
              >
                {isLastStep ? (
                  <>
                    Finish tour
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
