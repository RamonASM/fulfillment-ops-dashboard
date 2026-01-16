/**
 * Theme System for Inventory UI Components
 *
 * Admin theme uses 'primary' colors (blue)
 * Portal theme uses 'emerald' colors (green)
 */

import { createContext, useContext } from 'react';

export type ThemeVariant = 'admin' | 'portal';

export interface ThemeColors {
  primary: {
    50: string;
    100: string;
    200: string;
    600: string;
    700: string;
  };
}

export const themes: Record<ThemeVariant, ThemeColors> = {
  admin: {
    primary: {
      50: 'bg-primary-50',
      100: 'border-primary-100',
      200: 'border-primary-200',
      600: 'bg-primary-600 text-primary-600 border-t-primary-600',
      700: 'hover:bg-primary-700',
    },
  },
  portal: {
    primary: {
      50: 'bg-emerald-50',
      100: 'border-emerald-100',
      200: 'border-emerald-200',
      600: 'bg-emerald-600 text-emerald-600 border-t-emerald-600',
      700: 'hover:bg-emerald-700',
    },
  },
};

// Simplified theme classes for components
export interface ThemeClasses {
  bgPrimary: string;
  bgPrimaryHover: string;
  textPrimary: string;
  borderPrimary: string;
  spinnerBorder: string;
  spinnerBorderTop: string;
}

export const themeClasses: Record<ThemeVariant, ThemeClasses> = {
  admin: {
    bgPrimary: 'bg-primary-600',
    bgPrimaryHover: 'hover:bg-primary-700',
    textPrimary: 'text-primary-600',
    borderPrimary: 'border-primary-600',
    spinnerBorder: 'border-primary-200',
    spinnerBorderTop: 'border-t-primary-600',
  },
  portal: {
    bgPrimary: 'bg-emerald-600',
    bgPrimaryHover: 'hover:bg-emerald-700',
    textPrimary: 'text-emerald-600',
    borderPrimary: 'border-emerald-600',
    spinnerBorder: 'border-emerald-200',
    spinnerBorderTop: 'border-t-emerald-600',
  },
};

export interface ThemeContextValue {
  variant: ThemeVariant;
  classes: ThemeClasses;
}

export const ThemeContext = createContext<ThemeContextValue>({
  variant: 'admin',
  classes: themeClasses.admin,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export { ThemeProvider } from './ThemeProvider.js';
