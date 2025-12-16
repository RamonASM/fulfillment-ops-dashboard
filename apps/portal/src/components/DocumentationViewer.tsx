// =============================================================================
// DOCUMENTATION VIEWER
// Display markdown documentation with navigation and search
// =============================================================================

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Search, Book, ChevronRight, Home } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// =============================================================================
// TYPES
// =============================================================================

interface Documentation {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  excerpt?: string;
  order: number;
  viewCount: number;
  updatedAt: string;
}

interface DocumentationViewerProps {
  audience: "admin" | "client";
  initialSlug?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DocumentationViewer({
  audience,
  initialSlug,
}: DocumentationViewerProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    initialSlug || null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch all documentation
  const { data: docs, isLoading: docsLoading } = useQuery<Documentation[]>({
    queryKey: ["documentation", audience],
    queryFn: async () => {
      const response = await api.get<{ data: Documentation[] }>(
        `/documentation?audience=${audience}`,
      );
      return response.data;
    },
  });

  // Fetch categories
  const { data: categories } = useQuery<string[]>({
    queryKey: ["documentation-categories", audience],
    queryFn: async () => {
      const response = await api.get<{ data: string[] }>(
        `/documentation/categories?audience=${audience}`,
      );
      return response.data;
    },
  });

  // Fetch selected document
  const { data: selectedDoc, isLoading: docLoading } = useQuery<Documentation>({
    queryKey: ["documentation-detail", selectedSlug],
    queryFn: async () => {
      const response = await api.get<{ data: Documentation }>(
        `/documentation/${selectedSlug}`,
      );
      return response.data;
    },
    enabled: !!selectedSlug,
  });

  // Filter documents
  const filteredDocs = docs?.filter((doc) => {
    const matchesSearch =
      !searchTerm ||
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.excerpt?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      !selectedCategory || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedDocs = filteredDocs?.reduce(
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
            <Book className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Help & Support</h2>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
        {categories && categories.length > 1 && (
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  !selectedCategory
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1 text-sm rounded-full capitalize transition-colors ${
                    selectedCategory === category
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {category.replace(/-/g, " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documentation List */}
        <div className="flex-1 overflow-y-auto">
          {docsLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : (
            <div className="p-4 space-y-4">
              {groupedDocs && Object.keys(groupedDocs).length > 0 ? (
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
                              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                                selectedSlug === doc.slug
                                  ? "bg-blue-50 text-blue-700"
                                  : "hover:bg-gray-100 text-gray-700"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                  {doc.title}
                                </span>
                                {selectedSlug === doc.slug && (
                                  <ChevronRight className="w-4 h-4" />
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
          <div className="max-w-4xl mx-auto p-8">
            {/* Breadcrumb */}
            <nav className="flex items-center text-sm text-gray-500 mb-4">
              <button
                onClick={() => setSelectedSlug(null)}
                className="hover:text-gray-700 flex items-center gap-1"
              >
                <Home className="w-4 h-4" />
                Documentation
              </button>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="capitalize">
                {selectedDoc.category.replace(/-/g, " ")}
              </span>
              <ChevronRight className="w-4 h-4 mx-2" />
              <span className="text-gray-900">{selectedDoc.title}</span>
            </nav>

            {/* Document */}
            <article className="bg-white rounded-lg shadow-sm p-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {selectedDoc.title}
              </h1>
              <div className="text-sm text-gray-500 mb-8">
                Last updated:{" "}
                {new Date(selectedDoc.updatedAt).toLocaleDateString()}
              </div>

              {docLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="prose prose-blue max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => (
                        <h1
                          className="text-2xl font-bold mt-8 mb-4"
                          {...props}
                        />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2
                          className="text-xl font-semibold mt-6 mb-3"
                          {...props}
                        />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3
                          className="text-lg font-semibold mt-4 mb-2"
                          {...props}
                        />
                      ),
                      p: ({ node, ...props }) => (
                        <p className="mb-4 leading-relaxed" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul
                          className="list-disc list-inside mb-4 space-y-2"
                          {...props}
                        />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol
                          className="list-decimal list-inside mb-4 space-y-2"
                          {...props}
                        />
                      ),
                      code: ({ node, inline, ...props }: any) =>
                        inline ? (
                          <code
                            className="px-1.5 py-0.5 bg-gray-100 text-sm rounded"
                            {...props}
                          />
                        ) : (
                          <code
                            className="block p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm"
                            {...props}
                          />
                        ),
                      blockquote: ({ node, ...props }) => (
                        <blockquote
                          className="border-l-4 border-blue-500 pl-4 py-2 my-4 italic bg-blue-50"
                          {...props}
                        />
                      ),
                      a: ({ node, ...props }) => (
                        <a
                          className="text-blue-600 hover:text-blue-800 underline"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        />
                      ),
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4">
                          <table
                            className="min-w-full divide-y divide-gray-200 border"
                            {...props}
                          />
                        </div>
                      ),
                      th: ({ node, ...props }) => (
                        <th
                          className="px-4 py-2 bg-gray-50 text-left text-xs font-semibold text-gray-700 uppercase"
                          {...props}
                        />
                      ),
                      td: ({ node, ...props }) => (
                        <td className="px-4 py-2 border-t text-sm" {...props} />
                      ),
                    }}
                  >
                    {selectedDoc.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Helpful? */}
              <div className="mt-12 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-2">
                  Was this article helpful?
                </p>
                <div className="flex gap-2">
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                    Yes
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                    No
                  </button>
                </div>
              </div>
            </article>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Book className="w-16 h-16 text-gray-300 mx-auto mb-4" />
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
