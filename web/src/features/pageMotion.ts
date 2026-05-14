import type { Variants } from "framer-motion";

export const pageMotionEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const pageContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.07
    }
  }
};

export const pageSectionVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.42,
      ease: pageMotionEase
    }
  }
};

export const pageCardVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: pageMotionEase
    }
  }
};

export const pageDetailVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: pageMotionEase
    }
  }
};

export function getSubtleHoverMotion(shouldReduceMotion: boolean | null) {
  return shouldReduceMotion
    ? undefined
    : {
        y: -2,
        boxShadow: "0 12px 24px rgba(15, 23, 42, 0.07)"
      };
}

export function getSubtleTapMotion(shouldReduceMotion: boolean | null) {
  return shouldReduceMotion ? undefined : { scale: 0.99 };
}
