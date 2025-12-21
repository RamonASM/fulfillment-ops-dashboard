/**
 * Shared Loading Components
 *
 * Phase 3.1: Frontend Code Consolidation
 *
 * Unified loading components used across web and portal apps.
 * Supports customizable color schemes for brand consistency.
 */

import { Package } from 'lucide-react';

export type LoadingColor = 'primary' | 'emerald' | 'blue' | 'gray';

interface LoadingScreenProps {
  message?: string;
  color?: LoadingColor;
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: LoadingColor;
}

// Color class mappings for Tailwind
const colorClasses = {
  primary: {
    bg: 'bg-primary-600',
    border: 'border-primary-200',
    borderT: 'border-t-primary-600',
    borderLight: 'border-primary-100',
    dot: 'bg-primary-600',
  },
  emerald: {
    bg: 'bg-emerald-600',
    border: 'border-emerald-200',
    borderT: 'border-t-emerald-600',
    borderLight: 'border-emerald-100',
    dot: 'bg-emerald-600',
  },
  blue: {
    bg: 'bg-blue-600',
    border: 'border-blue-200',
    borderT: 'border-t-blue-600',
    borderLight: 'border-blue-100',
    dot: 'bg-blue-600',
  },
  gray: {
    bg: 'bg-gray-600',
    border: 'border-gray-200',
    borderT: 'border-t-gray-600',
    borderLight: 'border-gray-100',
    dot: 'bg-gray-600',
  },
};

/**
 * Full-screen loading indicator with logo
 *
 * @param message - Loading message to display
 * @param color - Color scheme (default: 'primary')
 */
export function LoadingScreen({ message = 'Loading...', color = 'primary' }: LoadingScreenProps) {
  const colors = colorClasses[color];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          {/* Logo with pulse */}
          <div
            className={`w-16 h-16 ${colors.bg} rounded-2xl flex items-center justify-center mx-auto mb-6 animate-pulse`}
          >
            <Package className="w-8 h-8 text-white" />
          </div>

          {/* Spinner ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`w-20 h-20 border-4 ${colors.borderLight} ${colors.borderT} rounded-full animate-spin`}
            />
          </div>
        </div>

        <h2 className="text-lg font-medium text-gray-900 mt-4">{message}</h2>
        <p className="text-sm text-gray-500 mt-1">Please wait a moment</p>
      </div>
    </div>
  );
}

/**
 * Fixed overlay loading indicator
 *
 * @param message - Optional loading message
 * @param color - Color scheme (default: 'primary')
 */
export function LoadingOverlay({ message, color = 'primary' }: LoadingScreenProps) {
  const colors = colorClasses[color];

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div
          className={`w-12 h-12 border-4 ${colors.border} ${colors.borderT} rounded-full animate-spin mx-auto mb-4`}
        />
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
    </div>
  );
}

/**
 * Spinner component with size variations
 *
 * @param size - Spinner size (sm, md, lg)
 * @param color - Color scheme (default: 'primary')
 */
export function LoadingSpinner({ size = 'md', color = 'primary' }: LoadingSpinnerProps) {
  const colors = colorClasses[color];

  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={`${sizeClasses[size]} ${colors.border} ${colors.borderT} rounded-full animate-spin`}
    />
  );
}

/**
 * Animated loading dots
 *
 * @param color - Color scheme (default: 'primary')
 */
export function LoadingDots({ color = 'primary' }: { color?: LoadingColor }) {
  const colors = colorClasses[color];

  return (
    <div className="flex items-center gap-1">
      <div
        className={`w-2 h-2 ${colors.dot} rounded-full animate-bounce`}
        style={{ animationDelay: '0ms' }}
      />
      <div
        className={`w-2 h-2 ${colors.dot} rounded-full animate-bounce`}
        style={{ animationDelay: '150ms' }}
      />
      <div
        className={`w-2 h-2 ${colors.dot} rounded-full animate-bounce`}
        style={{ animationDelay: '300ms' }}
      />
    </div>
  );
}

/**
 * Centered page loader
 *
 * @param color - Color scheme (default: 'primary')
 */
export function PageLoader({ color = 'primary' }: { color?: LoadingColor }) {
  return (
    <div className="flex items-center justify-center py-20">
      <LoadingSpinner size="lg" color={color} />
    </div>
  );
}

/**
 * Inline loader with text
 *
 * @param text - Loading text (default: 'Loading')
 * @param color - Color scheme (default: 'primary')
 */
export function InlineLoader({
  text = 'Loading',
  color = 'primary',
}: {
  text?: string;
  color?: LoadingColor;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <LoadingSpinner size="sm" color={color} />
      <span>{text}...</span>
    </div>
  );
}
