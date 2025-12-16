// =============================================================================
// HELP DASHBOARD TYPES
// Shared TypeScript interfaces for the help/documentation system
// =============================================================================

/**
 * Theme variants for theming the help dashboard
 */
export type HelpTheme = "blue" | "emerald";

/**
 * Audience types for filtering documentation
 */
export type DocumentationAudience = "admin" | "client" | "both";

/**
 * Documentation category types
 */
export type DocumentationCategory =
  | "getting-started"
  | "features"
  | "how-to"
  | "faq"
  | "integrations"
  | "best-practices"
  | "orders"
  | "inventory";

/**
 * Documentation article interface
 */
export interface Documentation {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  excerpt?: string;
  audience: DocumentationAudience;
  order: number;
  viewCount: number;
  tags?: string[];
  keywords?: string[];
  published: boolean;
  updatedAt: string;
  createdAt: string;
}

/**
 * Table of contents heading
 */
export interface TocHeading {
  id: string;
  text: string;
  level: number; // 2 or 3 (H2 or H3)
}

/**
 * Tutorial step for progress tracking
 */
export interface TutorialStep {
  id: string;
  title: string;
  completed: boolean;
}

/**
 * Tutorial progress stored in localStorage
 */
export interface TutorialProgress {
  steps: TutorialStep[];
  lastUpdated: string;
}

/**
 * Feedback submission payload
 */
export interface FeedbackSubmission {
  helpful: boolean;
  comment?: string;
}

/**
 * Video embed configuration
 */
export interface VideoEmbedConfig {
  url: string;
  type: "youtube" | "vimeo" | "direct";
  videoId?: string;
}

/**
 * Props for HelpDashboard component
 */
export interface HelpDashboardProps {
  audience: "admin" | "client";
  theme: HelpTheme;
  initialSlug?: string;
}

/**
 * Props for ArticleRenderer component
 */
export interface ArticleRendererProps {
  content: string;
  searchTerm?: string;
  theme: HelpTheme;
}

/**
 * Props for TableOfContents component
 */
export interface TableOfContentsProps {
  content: string;
  theme: HelpTheme;
}

/**
 * Props for ProgressTracker component
 */
export interface ProgressTrackerProps {
  articleSlug: string;
  content: string;
  theme: HelpTheme;
}

/**
 * Props for VideoEmbed component
 */
export interface VideoEmbedProps {
  url: string;
  title?: string;
}

/**
 * Props for HelpFeedback component
 */
export interface HelpFeedbackProps {
  articleSlug: string;
  theme: HelpTheme;
  onFeedbackSubmitted?: () => void;
}
