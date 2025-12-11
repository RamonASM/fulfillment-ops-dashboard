import type { Variants, Transition } from 'framer-motion';

// =============================================================================
// TRANSITION PRESETS
// =============================================================================

export const transitions = {
  fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } as Transition,
  default: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } as Transition,
  smooth: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } as Transition,
  spring: { type: 'spring', stiffness: 300, damping: 30 } as Transition,
  springBouncy: { type: 'spring', stiffness: 400, damping: 25 } as Transition,
};

// =============================================================================
// FADE VARIANTS
// =============================================================================

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.default },
  exit: { opacity: 0, transition: transitions.fast },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: transitions.fast
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: transitions.fast
  },
};

// =============================================================================
// SCALE VARIANTS
// =============================================================================

export const scaleIn: Variants = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: transitions.spring
  },
  exit: {
    scale: 0.95,
    opacity: 0,
    transition: transitions.fast
  },
};

export const popIn: Variants = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: transitions.springBouncy
  },
  exit: {
    scale: 0.9,
    opacity: 0,
    transition: transitions.fast
  },
};

// =============================================================================
// SLIDE VARIANTS
// =============================================================================

export const slideInRight: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.smooth
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: transitions.default
  },
};

export const slideInLeft: Variants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.smooth
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: transitions.default
  },
};

// =============================================================================
// CONTAINER VARIANTS (for staggering children)
// =============================================================================

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
};

// =============================================================================
// ITEM VARIANTS (for use with stagger containers)
// =============================================================================

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.default,
  },
};

export const staggerItemScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
};

// =============================================================================
// MODAL/DIALOG VARIANTS
// =============================================================================

export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, delay: 0.1 }
  },
};

export const modalContent: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.springBouncy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: transitions.fast,
  },
};

// =============================================================================
// DROPDOWN/MENU VARIANTS
// =============================================================================

export const dropdownMenu: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.1 }
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -5,
    transition: { duration: 0.1 }
  },
};

export const dropdownItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

// =============================================================================
// TOOLTIP VARIANTS
// =============================================================================

export const tooltip: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: 0.1 }
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15 }
  },
};

// =============================================================================
// SIDEBAR VARIANTS
// =============================================================================

export const sidebarItem: Variants = {
  idle: {
    x: 0,
    backgroundColor: 'transparent',
  },
  hover: {
    x: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    transition: transitions.fast,
  },
  active: {
    x: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
};

// =============================================================================
// CARD VARIANTS
// =============================================================================

export const cardHover: Variants = {
  idle: {
    y: 0,
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.06)'
  },
  hover: {
    y: -4,
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.12)',
    transition: transitions.spring,
  },
};

// =============================================================================
// NOTIFICATION/TOAST VARIANTS
// =============================================================================

export const toast: Variants = {
  hidden: {
    opacity: 0,
    y: 50,
    scale: 0.9
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: transitions.springBouncy,
  },
  exit: {
    opacity: 0,
    x: 100,
    scale: 0.9,
    transition: transitions.default,
  },
};

// =============================================================================
// PAGE TRANSITION VARIANTS
// =============================================================================

export const pageTransition: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// =============================================================================
// SKELETON LOADING VARIANT
// =============================================================================

export const skeleton: Variants = {
  loading: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a custom stagger container with configurable delay
 */
export function createStaggerContainer(staggerDelay = 0.05, initialDelay = 0): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      },
    },
  };
}

/**
 * Create a custom fade in up variant with configurable offset
 */
export function createFadeInUp(yOffset = 20): Variants {
  return {
    hidden: { opacity: 0, y: yOffset },
    visible: {
      opacity: 1,
      y: 0,
      transition: transitions.smooth
    },
  };
}
