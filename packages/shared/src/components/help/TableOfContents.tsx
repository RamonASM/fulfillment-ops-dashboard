// =============================================================================
// TABLE OF CONTENTS
// Auto-generates TOC from markdown headings with smooth scrolling
// =============================================================================

import React, { useState, useEffect } from "react";
import type { TableOfContentsProps, TocHeading } from "./types";

// =============================================================================
// THEME COLORS
// =============================================================================

const themeColors = {
  blue: {
    active: "text-blue-700 bg-blue-50 border-l-2 border-blue-600",
    hover: "hover:text-blue-600 hover:bg-blue-50",
    text: "text-gray-600",
  },
  emerald: {
    active: "text-emerald-700 bg-emerald-50 border-l-2 border-emerald-600",
    hover: "hover:text-emerald-600 hover:bg-emerald-50",
    text: "text-gray-600",
  },
};

// =============================================================================
// HEADING EXTRACTION
// Extract H2 and H3 headings from markdown content
// =============================================================================

function extractHeadings(markdown: string): TocHeading[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: TocHeading[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length; // Number of # symbols
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (level === 2 || level === 3) {
      headings.push({ id, text, level });
    }
  }

  return headings;
}

// =============================================================================
// TABLE OF CONTENTS COMPONENT
// =============================================================================

export function TableOfContents({ content, theme }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const colors = themeColors[theme];

  // Extract headings on mount and when content changes
  useEffect(() => {
    const extracted = extractHeadings(content);
    setHeadings(extracted);

    // Set first heading as active initially
    if (extracted.length > 0) {
      setActiveId(extracted[0].id);
    }
  }, [content]);

  // Track scroll position and highlight current section
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100; // Offset for sticky header

      // Find the heading that's currently in view
      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        const element = document.getElementById(heading.id);

        if (element && element.offsetTop <= scrollPosition) {
          setActiveId(heading.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [headings]);

  // Smooth scroll to heading
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // Account for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });

      setActiveId(id);
    }
  };

  // Don't render if no headings
  if (headings.length === 0) {
    return null;
  }

  return (
    <nav className="hidden lg:block sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            On This Page
          </h3>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={
              isCollapsed
                ? "Expand table of contents"
                : "Collapse table of contents"
            }
          >
            {isCollapsed ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Headings List */}
        {!isCollapsed && (
          <ul className="space-y-1">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  onClick={() => scrollToHeading(heading.id)}
                  className={`
                    w-full text-left text-sm py-1.5 px-3 rounded transition-colors
                    ${heading.level === 3 ? "pl-6" : ""}
                    ${
                      activeId === heading.id
                        ? colors.active
                        : `${colors.text} ${colors.hover}`
                    }
                  `}
                  aria-current={
                    activeId === heading.id ? "location" : undefined
                  }
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Scroll to Top Button */}
        {!isCollapsed && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`
              mt-4 w-full text-sm py-2 px-3 rounded transition-colors
              border border-gray-200 ${colors.text} ${colors.hover}
            `}
          >
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
              <span>Back to Top</span>
            </div>
          </button>
        )}
      </div>
    </nav>
  );
}
