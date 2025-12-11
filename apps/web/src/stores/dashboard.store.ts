// =============================================================================
// DASHBOARD STORE (Phase 11)
// Zustand store for dashboard preferences and widget state
// =============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface WidgetConfig {
  id: string;
  type: string;
  visible: boolean;
  position: number;
  size: 'small' | 'medium' | 'large';
  collapsed?: boolean;
  settings?: Record<string, unknown>;
}

export interface DashboardLayout {
  columns: number;
  widgets: WidgetConfig[];
}

interface DashboardState {
  // Layout
  layout: DashboardLayout;
  refreshRate: number;
  theme: 'light' | 'dark' | 'system';
  lastRefresh: Date | null;
  isLoading: boolean;

  // Actions
  setLayout: (layout: DashboardLayout) => void;
  setRefreshRate: (rate: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleWidgetVisibility: (widgetId: string) => void;
  toggleWidgetCollapsed: (widgetId: string) => void;
  reorderWidgets: (startIndex: number, endIndex: number) => void;
  updateWidgetSettings: (widgetId: string, settings: Record<string, unknown>) => void;
  resetToDefaults: () => void;
  setLoading: (loading: boolean) => void;
  setLastRefresh: (date: Date) => void;
}

// Default widgets
const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpi-inventory', type: 'kpi', visible: true, position: 0, size: 'small' },
  { id: 'kpi-alerts', type: 'kpi', visible: true, position: 1, size: 'small' },
  { id: 'kpi-turnover', type: 'kpi', visible: true, position: 2, size: 'small' },
  { id: 'kpi-resolution', type: 'kpi', visible: true, position: 3, size: 'small' },
  { id: 'health-heatmap', type: 'heatmap', visible: true, position: 4, size: 'large' },
  { id: 'alert-burndown', type: 'chart', visible: true, position: 5, size: 'medium' },
  { id: 'risk-overview', type: 'chart', visible: true, position: 6, size: 'medium' },
  { id: 'forecast-accuracy', type: 'chart', visible: false, position: 7, size: 'medium' },
];

const DEFAULT_LAYOUT: DashboardLayout = {
  columns: 4,
  widgets: DEFAULT_WIDGETS,
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      layout: DEFAULT_LAYOUT,
      refreshRate: 300000, // 5 minutes
      theme: 'light',
      lastRefresh: null,
      isLoading: false,

      // Actions
      setLayout: (layout) => set({ layout }),

      setRefreshRate: (refreshRate) => set({ refreshRate }),

      setTheme: (theme) => set({ theme }),

      toggleWidgetVisibility: (widgetId) => {
        const { layout } = get();
        const widgets = layout.widgets.map((w) =>
          w.id === widgetId ? { ...w, visible: !w.visible } : w
        );
        set({ layout: { ...layout, widgets } });
      },

      toggleWidgetCollapsed: (widgetId) => {
        const { layout } = get();
        const widgets = layout.widgets.map((w) =>
          w.id === widgetId ? { ...w, collapsed: !w.collapsed } : w
        );
        set({ layout: { ...layout, widgets } });
      },

      reorderWidgets: (startIndex, endIndex) => {
        const { layout } = get();
        const widgets = [...layout.widgets];
        const [removed] = widgets.splice(startIndex, 1);
        widgets.splice(endIndex, 0, removed);

        // Update positions
        const reorderedWidgets = widgets.map((w, index) => ({
          ...w,
          position: index,
        }));

        set({ layout: { ...layout, widgets: reorderedWidgets } });
      },

      updateWidgetSettings: (widgetId, settings) => {
        const { layout } = get();
        const widgets = layout.widgets.map((w) =>
          w.id === widgetId ? { ...w, settings: { ...w.settings, ...settings } } : w
        );
        set({ layout: { ...layout, widgets } });
      },

      resetToDefaults: () => {
        set({
          layout: DEFAULT_LAYOUT,
          refreshRate: 300000,
          theme: 'light',
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      setLastRefresh: (lastRefresh) => set({ lastRefresh }),
    }),
    {
      name: 'dashboard-preferences',
      partialize: (state) => ({
        layout: state.layout,
        refreshRate: state.refreshRate,
        theme: state.theme,
      }),
    }
  )
);

// Selectors
export const selectVisibleWidgets = (state: DashboardState) =>
  state.layout.widgets
    .filter((w) => w.visible)
    .sort((a, b) => a.position - b.position);

export const selectWidgetById = (widgetId: string) => (state: DashboardState) =>
  state.layout.widgets.find((w) => w.id === widgetId);

export default useDashboardStore;
