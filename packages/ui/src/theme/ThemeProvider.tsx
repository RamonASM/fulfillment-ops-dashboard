import { ReactNode } from 'react';
import { ThemeContext, ThemeVariant, themeClasses } from './index.js';

interface ThemeProviderProps {
  variant: ThemeVariant;
  children: ReactNode;
}

export function ThemeProvider({ variant, children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={{ variant, classes: themeClasses[variant] }}>
      {children}
    </ThemeContext.Provider>
  );
}
