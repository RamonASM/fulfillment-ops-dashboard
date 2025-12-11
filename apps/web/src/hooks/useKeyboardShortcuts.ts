import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

type ShortcutHandler = () => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description: string;
}

// Global shortcuts registry
const shortcuts: ShortcutConfig[] = [];

export function registerShortcut(config: ShortcutConfig): () => void {
  shortcuts.push(config);
  return () => {
    const index = shortcuts.indexOf(config);
    if (index > -1) shortcuts.splice(index, 1);
  };
}

export function getShortcuts(): ShortcutConfig[] {
  return [...shortcuts];
}

// Hook for using keyboard shortcuts
export function useKeyboardShortcuts() {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape to work in inputs
      if (e.key !== 'Escape') return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
      const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Hook for "G then X" style navigation shortcuts
export function useNavigationShortcuts() {
  const navigate = useNavigate();
  const [gPressed, setGPressed] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        setGPressed(true);
        timeout = setTimeout(() => setGPressed(false), 1000);
        return;
      }

      if (gPressed) {
        setGPressed(false);
        clearTimeout(timeout);

        const routes: Record<string, string> = {
          h: '/',           // Home/Dashboard
          a: '/alerts',     // Alerts
          c: '/clients',    // Clients
          r: '/reports',    // Reports
          s: '/settings',   // Settings
        };

        const route = routes[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeout);
    };
  }, [gPressed, navigate]);
}

// Missing import
import { useState } from 'react';

// Predefined app shortcuts
export function useAppShortcuts(callbacks: {
  onOpenCommandPalette?: () => void;
  onRefresh?: () => void;
  onToggleSidebar?: () => void;
}) {
  useEffect(() => {
    const unregister: Array<() => void> = [];

    // Cmd/Ctrl + K - Command palette (handled elsewhere but documented)
    if (callbacks.onOpenCommandPalette) {
      unregister.push(
        registerShortcut({
          key: 'k',
          meta: true,
          handler: callbacks.onOpenCommandPalette,
          description: 'Open command palette',
        })
      );
    }

    // Cmd/Ctrl + R - Refresh data
    if (callbacks.onRefresh) {
      unregister.push(
        registerShortcut({
          key: 'r',
          meta: true,
          shift: true,
          handler: callbacks.onRefresh,
          description: 'Refresh data',
        })
      );
    }

    // Cmd/Ctrl + B - Toggle sidebar
    if (callbacks.onToggleSidebar) {
      unregister.push(
        registerShortcut({
          key: 'b',
          meta: true,
          handler: callbacks.onToggleSidebar,
          description: 'Toggle sidebar',
        })
      );
    }

    return () => unregister.forEach((fn) => fn());
  }, [callbacks]);
}

// Hook for table navigation
export function useTableNavigation(config: {
  rowCount: number;
  onSelect?: (index: number) => void;
  onAction?: (index: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, config.rowCount - 1));
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          if (selectedIndex >= 0 && config.onAction) {
            e.preventDefault();
            config.onAction(selectedIndex);
          }
          break;
        case ' ':
          if (selectedIndex >= 0 && config.onSelect) {
            e.preventDefault();
            config.onSelect(selectedIndex);
          }
          break;
        case 'Escape':
          setSelectedIndex(-1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, config]);

  return {
    selectedIndex,
    setSelectedIndex,
    clearSelection: () => setSelectedIndex(-1),
  };
}
