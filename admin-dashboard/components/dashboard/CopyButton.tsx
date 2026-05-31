"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type CopyButtonSize = "sm" | "md" | "lg";

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: CopyButtonSize;
  iconOnly?: boolean;
}

const SIZE_CLASSES: Record<CopyButtonSize, string> = {
  sm: "min-h-7 px-2 py-0.5 text-[11px] gap-1",
  md: "min-h-9 px-3 py-1 text-xs gap-1.5",
  lg: "min-h-10 px-4 py-1.5 text-sm gap-2",
};

const ICON_SIZES: Record<CopyButtonSize, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

export function CopyButton({
  value,
  label = "Copy",
  size = "md",
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const iconClass = ICON_SIZES[size];

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      whileTap={{ scale: 0.92 }}
      animate={copied ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`inline-flex items-center rounded-full border font-semibold transition ${SIZE_CLASSES[size]} ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
          : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
      }`}
      aria-label={`${copied ? "Copied" : label} ${value}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-inherit"
          >
            <Check className={iconClass} aria-hidden="true" />
            {!iconOnly && <span>Copied</span>}
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-inherit"
          >
            <Copy className={iconClass} aria-hidden="true" />
            {!iconOnly && <span>{label}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
