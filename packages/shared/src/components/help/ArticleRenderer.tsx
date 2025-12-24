// =============================================================================
// ARTICLE RENDERER
// Renders markdown content with custom React components for rich formatting
// =============================================================================

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArticleRendererProps } from "./types";

// =============================================================================
// THEME COLORS
// =============================================================================

const themeColors = {
  blue: {
    primary: "text-blue-600",
    primaryHover: "hover:text-blue-800",
    bg: "bg-blue-50",
    border: "border-blue-200",
    code: "bg-blue-100",
    codeBg: "bg-blue-50",
    codeText: "text-blue-900",
    codeHeaderBg: "bg-blue-100",
    codeHeaderText: "text-blue-700",
  },
  emerald: {
    primary: "text-emerald-600",
    primaryHover: "hover:text-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    code: "bg-emerald-100",
    codeBg: "bg-emerald-50",
    codeText: "text-emerald-900",
    codeHeaderBg: "bg-emerald-100",
    codeHeaderText: "text-emerald-700",
  },
};

// =============================================================================
// SEARCH HIGHLIGHTING HELPER
// =============================================================================

function highlightSearchTerm(
  text: string,
  searchTerm?: string,
): React.ReactNode {
  if (!searchTerm || !text) return text;

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} className="bg-yellow-200 px-1 rounded">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// =============================================================================
// CALLOUT BOX COMPONENT
// Renders blockquotes as styled callout boxes with icons
// =============================================================================

interface CalloutProps {
  children: React.ReactNode;
  theme: "blue" | "emerald";
}

function Callout({ children, theme }: CalloutProps) {
  // Extract callout type from first child if it starts with **Type**:
  const firstChild = React.Children.toArray(children)[0];
  let type: "note" | "warning" | "tip" = "note";
  let content = children;

  if (
    firstChild &&
    typeof firstChild === "object" &&
    "props" in firstChild &&
    firstChild.props.children
  ) {
    const text = String(firstChild.props.children);
    if (text.startsWith("**Note**")) type = "note";
    else if (text.startsWith("**Warning**")) type = "warning";
    else if (text.startsWith("**Tip**")) type = "tip";
  }

  const styles = {
    note: {
      border: "border-blue-500",
      bg: "bg-blue-50",
      text: "text-blue-900",
      icon: "📘",
    },
    warning: {
      border: "border-amber-500",
      bg: "bg-amber-50",
      text: "text-amber-900",
      icon: "⚠️",
    },
    tip: {
      border: "border-green-500",
      bg: "bg-green-50",
      text: "text-green-900",
      icon: "💡",
    },
  };

  const style = styles[type];

  return (
    <blockquote
      className={`border-l-4 ${style.border} ${style.bg} pl-4 pr-4 py-3 my-4 rounded-r-lg ${style.text}`}
    >
      <div className="flex gap-2">
        <span className="text-xl flex-shrink-0">{style.icon}</span>
        <div className="flex-1">{content}</div>
      </div>
    </blockquote>
  );
}

// =============================================================================
// ARTICLE RENDERER COMPONENT
// =============================================================================

export function ArticleRenderer({
  content,
  searchTerm,
  theme,
}: ArticleRendererProps) {
  const colors = themeColors[theme];

  return (
    <div className="prose prose-gray max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings with auto-generated IDs for TOC linking
          h1: ({ node, children, ...props }) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return (
              <h1
                id={id}
                className="text-3xl font-bold mt-8 mb-4 scroll-mt-20"
                {...props}
              >
                {searchTerm ? highlightSearchTerm(text, searchTerm) : children}
              </h1>
            );
          },
          h2: ({ node, children, ...props }) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return (
              <h2
                id={id}
                className="text-2xl font-semibold mt-6 mb-3 scroll-mt-20"
                {...props}
              >
                {searchTerm ? highlightSearchTerm(text, searchTerm) : children}
              </h2>
            );
          },
          h3: ({ node, children, ...props }) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return (
              <h3
                id={id}
                className="text-xl font-semibold mt-4 mb-2 scroll-mt-20"
                {...props}
              >
                {searchTerm ? highlightSearchTerm(text, searchTerm) : children}
              </h3>
            );
          },

          // Paragraphs
          p: ({ node, children, ...props }) => (
            <p className="mb-4 leading-relaxed text-gray-700" {...props}>
              {children}
            </p>
          ),

          // Lists
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc list-outside ml-6 mb-4 space-y-2"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal list-outside ml-6 mb-4 space-y-2"
              {...props}
            />
          ),
          li: ({ node, children, ...props }) => (
            <li className="text-gray-700" {...props}>
              {children}
            </li>
          ),

          // Code blocks - theme-colored for better readability
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className={`px-1.5 py-0.5 ${colors.code} text-sm rounded font-mono`}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            // Extract language from className (e.g., "language-javascript")
            const language = className?.replace("language-", "") || "text";

            return (
              <div className={`my-4 rounded-lg overflow-hidden border ${colors.border}`}>
                {language !== "text" && (
                  <div className={`${colors.codeHeaderBg} px-4 py-2 text-xs ${colors.codeHeaderText} font-mono border-b ${colors.border}`}>
                    {language}
                  </div>
                )}
                <pre className={`${colors.codeBg} p-4 overflow-x-auto`}>
                  <code
                    className={`${colors.codeText} text-sm font-mono block`}
                    {...props}
                  >
                    {children}
                  </code>
                </pre>
              </div>
            );
          },

          // Blockquotes (styled as callout boxes)
          blockquote: ({ node, children, ...props }) => (
            <Callout theme={theme}>{children}</Callout>
          ),

          // Links
          a: ({ node, children, href, ...props }) => (
            <a
              href={href}
              className={`${colors.primary} ${colors.primaryHover} underline`}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              {...props}
            >
              {children}
            </a>
          ),

          // Tables
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 border border-gray-200 rounded-lg">
              <table
                className="min-w-full divide-y divide-gray-200"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-50" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="bg-white divide-y divide-gray-200" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 text-sm text-gray-700" {...props} />
          ),

          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-t-2 border-gray-200" {...props} />
          ),

          // Strong (bold)
          strong: ({ node, children, ...props }) => (
            <strong className="font-semibold text-gray-900" {...props}>
              {children}
            </strong>
          ),

          // Emphasis (italic)
          em: ({ node, children, ...props }) => (
            <em className="italic text-gray-700" {...props}>
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
