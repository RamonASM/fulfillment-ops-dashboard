// =============================================================================
// HELP DASHBOARD
// Main help/documentation dashboard with search, categories, and article viewing
// Reusable across web app (admin) and portal (client)
// =============================================================================

import React, { useState, useEffect } from "react";
import { ArticleRenderer } from "./ArticleRenderer";
import { TableOfContents } from "./TableOfContents";
import { ProgressTracker } from "./ProgressTracker";
import { HelpFeedback } from "./HelpFeedback";
import type { HelpDashboardProps, Documentation } from "./types";

// =============================================================================
// THEME COLORS
// =============================================================================

const themeColors = {
  blue: {
    primary: "text-blue-600",
    categoryActive: "bg-blue-100 text-blue-700",
    categoryHover: "hover:bg-blue-50",
    articleActive: "bg-blue-50 text-blue-700",
    articleHover: "hover:bg-gray-100",
    icon: "text-blue-600",
  },
  emerald: {
    primary: "text-emerald-600",
    categoryActive: "bg-emerald-100 text-emerald-700",
    categoryHover: "hover:bg-emerald-50",
    articleActive: "bg-emerald-50 text-emerald-700",
    articleHover: "hover:bg-gray-100",
    icon: "text-emerald-600",
  },
};

// =============================================================================
// UTILITY: Fetch wrapper with error handling
// =============================================================================

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const json = await response.json();
  return json.data || json;
}

// =============================================================================
// HELP DASHBOARD COMPONENT
// =============================================================================

export function HelpDashboard({
  audience,
  theme,
  initialSlug,
}: HelpDashboardProps) {
  const [docs, setDocs] = useState<Documentation[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Documentation | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    initialSlug || null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const colors = themeColors[theme];

  // Fetch all documentation on mount
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        setIsLoading(true);
        const data = await fetchAPI<Documentation[]>(
          `/api/documentation?audience=${audience}`,
        );
        setDocs(data);
      } catch (err) {
        setError("Failed to load documentation");
        console.error("Documentation fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocs();
  }, [audience]);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await fetchAPI<string[]>(
          `/api/documentation/categories?audience=${audience}`,
        );
        setCategories(data);
      } catch (err) {
        console.error("Categories fetch error:", err);
      }
    };

    fetchCategories();
  }, [audience]);

  // Fetch selected document
  useEffect(() => {
    if (!selectedSlug) {
      setSelectedDoc(null);
      return;
    }

    const fetchDoc = async () => {
      try {
        const data = await fetchAPI<Documentation>(
          `/api/documentation/${selectedSlug}`,
        );
        setSelectedDoc(data);
      } catch (err) {
        setError("Failed to load article");
        console.error("Document fetch error:", err);
      }
    };

    fetchDoc();
  }, [selectedSlug]);

  // Filter documents by search and category
  const filteredDocs = docs.filter((doc) => {
    const matchesSearch =
      !searchTerm ||
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.excerpt?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      !selectedCategory || doc.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group documents by category
  const groupedDocs = filteredDocs.reduce(
    (acc, doc) => {
      if (!acc[doc.category]) {
        acc[doc.category] = [];
      }
      acc[doc.category].push(doc);
      return acc;
    },
    {} as Record<string, Documentation[]>,
  );

  return (
    <div className="flex h-full bg-gray-50">
      {/* Sidebar Navigation */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <svg
              className={`w-6 h-6 ${colors.icon}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <h2 className="text-xl font-semibold">Help & Support</h2>
          </div>

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search documentation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Category Filter */}
        {categories.length > 1 && (
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`
                  px-3 py-1 text-sm rounded-full transition-colors
                  ${!selectedCategory ? colors.categoryActive : `bg-gray-100 text-gray-700 ${colors.categoryHover}`}
                `}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`
                    px-3 py-1 text-sm rounded-full capitalize transition-colors
                    ${selectedCategory === category ? colors.categoryActive : `bg-gray-100 text-gray-700 ${colors.categoryHover}`}
                  `}
                >
                  {category.replace(/-/g, " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documentation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : error && docs.length === 0 ? (
            <div className="p-4 text-center text-red-600">{error}</div>
          ) : (
            <div className="p-4 space-y-4">
              {Object.keys(groupedDocs).length > 0 ? (
                Object.entries(groupedDocs)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, categoryDocs]) => (
                    <div key={category}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        {category.replace(/-/g, " ")}
                      </h3>
                      <div className="space-y-1">
                        {categoryDocs
                          .sort((a, b) => a.order - b.order)
                          .map((doc) => (
                            <button
                              key={doc.slug}
                              onClick={() => setSelectedSlug(doc.slug)}
                              className={`
                                w-full text-left px-3 py-2 rounded-lg transition-colors
                                ${selectedSlug === doc.slug ? colors.articleActive : `text-gray-700 ${colors.articleHover}`}
                              `}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {doc.title}
                                </span>
                                {selectedSlug === doc.slug && (
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
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                )}
                              </div>
                              {doc.excerpt && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {doc.excerpt}
                                </p>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-center text-gray-500 py-8">
                  {searchTerm
                    ? "No results found"
                    : "No documentation available"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {selectedSlug && selectedDoc ? (
          <div className="max-w-5xl mx-auto p-8">
            <div className="flex gap-8">
              {/* Main Article Content */}
              <div className="flex-1 min-w-0">
                {/* Breadcrumb */}
                <nav className="flex items-center text-sm text-gray-500 mb-4">
                  <button
                    onClick={() => setSelectedSlug(null)}
                    className="hover:text-gray-700 flex items-center gap-1"
                  >
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
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    Documentation
                  </button>
                  <svg
                    className="w-4 h-4 mx-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="capitalize">
                    {selectedDoc.category.replace(/-/g, " ")}
                  </span>
                  <svg
                    className="w-4 h-4 mx-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="text-gray-900">{selectedDoc.title}</span>
                </nav>

                {/* Article */}
                <article className="bg-white rounded-lg shadow-sm p-8">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {selectedDoc.title}
                  </h1>
                  <div className="text-sm text-gray-500 mb-8">
                    Last updated:{" "}
                    {new Date(selectedDoc.updatedAt).toLocaleDateString()}
                  </div>

                  {/* Article Content */}
                  <ArticleRenderer
                    content={selectedDoc.content}
                    searchTerm={searchTerm}
                    theme={theme}
                  />

                  {/* Progress Tracker (if article contains task lists) */}
                  <ProgressTracker
                    articleSlug={selectedDoc.slug}
                    content={selectedDoc.content}
                    theme={theme}
                  />

                  {/* Feedback Widget */}
                  <HelpFeedback articleSlug={selectedDoc.slug} theme={theme} />
                </article>
              </div>

              {/* Table of Contents (Desktop only) */}
              <div className="w-64">
                <TableOfContents content={selectedDoc.content} theme={theme} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg
                className="w-16 h-16 text-gray-300 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Select a topic to get started
              </h3>
              <p className="text-gray-500">
                Browse documentation topics on the left
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
