// =============================================================================
// DATA QUALITY WIDGET
// Dashboard widget showing data quality issues and warnings
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  FileWarning,
  Package,
  TrendingDown,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";

interface DataQualityMetrics {
  importsWithErrors: number;
  recentImportErrors: Array<{
    id: string;
    filename: string;
    errorCount: number;
    createdAt: string;
  }>;
  productsWithZeroUsage: number;
  productsWithNoTransactions: number;
  totalProducts: number;
  daysSinceLastImport: number | null;
  lastImportDate: string | null;
}

export function DataQualityWidget() {
  const navigate = useNavigate();

  // Fetch data quality metrics from imports history
  const { data: metrics, isLoading, isError } = useQuery({
    queryKey: ["data-quality-metrics"],
    queryFn: async () => {
      const importsResponse = await api.get<{
        data: Array<{
          id: string;
          filename: string;
          status: string;
          errorCount: number;
          createdAt: string;
          client?: { name: string };
        }>;
      }>("/imports/history?limit=20");

      const imports = importsResponse.data || [];
      const recentImportErrors = imports
        .filter((imp) => imp.errorCount > 0)
        .slice(0, 3);

      const lastImport = imports[0];
      const daysSinceLastImport = lastImport
        ? Math.floor(
            (Date.now() - new Date(lastImport.createdAt).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      // Count total errors across all recent imports
      const totalErrors = imports.reduce((sum, imp) => sum + (imp.errorCount || 0), 0);

      return {
        importsWithErrors: imports.filter((imp) => imp.errorCount > 0).length,
        recentImportErrors,
        productsWithZeroUsage: 0, // Would need a separate endpoint
        productsWithNoTransactions: 0, // Would need a separate endpoint
        totalProducts: 0, // Would need a separate endpoint
        totalErrors,
        daysSinceLastImport,
        lastImportDate: lastImport?.createdAt || null,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Default metrics when loading or error
  const qualityMetrics: DataQualityMetrics = metrics || {
    importsWithErrors: 0,
    recentImportErrors: [],
    productsWithZeroUsage: 0,
    productsWithNoTransactions: 0,
    totalProducts: 0,
    daysSinceLastImport: null,
    lastImportDate: null,
  };

  const hasIssues =
    qualityMetrics.importsWithErrors > 0 ||
    qualityMetrics.productsWithZeroUsage > 0 ||
    (qualityMetrics.daysSinceLastImport !== null &&
      qualityMetrics.daysSinceLastImport > 7);

  const issueCount =
    qualityMetrics.importsWithErrors +
    (qualityMetrics.productsWithZeroUsage > 0 ? 1 : 0) +
    (qualityMetrics.daysSinceLastImport !== null &&
    qualityMetrics.daysSinceLastImport > 7
      ? 1
      : 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Data Quality</h3>
        </div>
        {hasIssues ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {issueCount} issue{issueCount !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
            <CheckCircle className="w-3 h-3" />
            Healthy
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : isError ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-sm text-red-700">Failed to load data quality metrics</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Import Errors */}
          {qualityMetrics.importsWithErrors > 0 && (
            <div
              className="p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors"
              onClick={() => navigate("/imports")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    {qualityMetrics.importsWithErrors} recent import
                    {qualityMetrics.importsWithErrors !== 1 ? "s" : ""} with
                    errors
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
              </div>
              {qualityMetrics.recentImportErrors.length > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  {qualityMetrics.recentImportErrors.map((imp) => (
                    <div key={imp.id} className="truncate">
                      {imp.filename}: {imp.errorCount} error
                      {imp.errorCount !== 1 ? "s" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Products with Zero Usage */}
          {qualityMetrics.productsWithZeroUsage > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {qualityMetrics.productsWithZeroUsage} product
                  {qualityMetrics.productsWithZeroUsage !== 1 ? "s" : ""} with
                  zero calculated usage
                </span>
              </div>
              <p className="mt-1 text-xs text-blue-700">
                These products may need order data to calculate usage
              </p>
            </div>
          )}

          {/* Data Freshness Warning */}
          {qualityMetrics.daysSinceLastImport !== null &&
            qualityMetrics.daysSinceLastImport > 7 && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">
                    Last import was {qualityMetrics.daysSinceLastImport} days ago
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Consider importing fresh data for accurate analytics
                </p>
              </div>
            )}

          {/* All Good State */}
          {!hasIssues && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-900">
                Data quality looks good!
              </p>
              <p className="text-xs text-green-700 mt-1">
                {qualityMetrics.totalProducts} products tracked
                {qualityMetrics.daysSinceLastImport !== null && (
                  <span>
                    {" "}
                    • Last import{" "}
                    {qualityMetrics.daysSinceLastImport === 0
                      ? "today"
                      : qualityMetrics.daysSinceLastImport === 1
                        ? "yesterday"
                        : `${qualityMetrics.daysSinceLastImport} days ago`}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Summary Stats */}
          {qualityMetrics.totalProducts > 0 && hasIssues && (
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {qualityMetrics.totalProducts} total products
                </span>
                {qualityMetrics.lastImportDate && (
                  <span>
                    Last import:{" "}
                    {new Date(qualityMetrics.lastImportDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
