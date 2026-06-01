"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import * as React from "react";

// Animation duration constants (200-300ms as per guidelines)
export const ANIMATION_DURATION = {
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
} as const;

// Easing presets
export const EASING = {
  easeOut: [0.0, 0.0, 0.2, 1],
  easeInOut: [0.4, 0.0, 0.2, 1],
  spring: { type: "spring", stiffness: 400, damping: 30 },
} as const;

// Page transition variants
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION.normal,
      ease: EASING.easeOut,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: ANIMATION_DURATION.fast,
      ease: EASING.easeInOut,
    },
  },
};

// Fade in variants
export const fadeInVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: ANIMATION_DURATION.normal },
  },
  exit: {
    opacity: 0,
    transition: { duration: ANIMATION_DURATION.fast },
  },
};

// Scale in variants (for modals)
export const scaleInVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: ANIMATION_DURATION.normal,
      ease: EASING.easeOut,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: ANIMATION_DURATION.fast,
      ease: EASING.easeInOut,
    },
  },
};

// Stagger children animation
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION.normal,
      ease: EASING.easeOut,
    },
  },
};

// Page transition wrapper
interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Fade in wrapper
interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: ANIMATION_DURATION.normal,
        delay,
        ease: EASING.easeOut,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Interactive hover card wrapper
interface HoverCardProps {
  children: React.ReactNode;
  className?: string;
  scale?: number;
  lift?: number;
}

export function HoverCard({
  children,
  className,
  scale = 1.01,
  lift = 2,
}: HoverCardProps) {
  return (
    <motion.div
      whileHover={{
        scale,
        y: -lift,
        transition: { duration: ANIMATION_DURATION.fast },
      }}
      whileTap={{ scale: 0.99 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Interactive hover link/button wrapper
interface HoverLinkProps {
  children: React.ReactNode;
  className?: string;
}

export function HoverLink({ children, className }: HoverLinkProps) {
  return (
    <motion.span
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

// Pulse animation for pending states
interface PulseProps {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}

export function Pulse({ children, className, active = true }: PulseProps) {
  if (!active) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      animate={{
        scale: [1, 1.05, 1],
        opacity: [1, 0.8, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

// Slide in from direction
interface SlideInProps {
  children: React.ReactNode;
  className?: string;
  direction?: "left" | "right" | "up" | "down";
  delay?: number;
}

export function SlideIn({
  children,
  className,
  direction = "up",
  delay = 0,
}: SlideInProps) {
  const directionOffset = {
    left: { x: -20, y: 0 },
    right: { x: 20, y: 0 },
    up: { x: 0, y: 20 },
    down: { x: 0, y: -20 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directionOffset[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{
        duration: ANIMATION_DURATION.normal,
        delay,
        ease: EASING.easeOut,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger container for animating lists
interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerContainer({ children, className }: StaggerContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger item for use inside StaggerContainer
interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className}>
      {children}
    </motion.div>
  );
}

// Re-export framer-motion essentials for convenience
export { motion, AnimatePresence };