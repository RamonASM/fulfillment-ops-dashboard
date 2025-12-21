import React from "react";
import { AlertCircle, Database } from "lucide-react";

interface WidgetDataStatusProps {
  isLoading: boolean;
  hasData: boolean;
  emptyMessage?: string;
  errorMessage?: string;
  children: React.ReactNode;
}

/**
 * Wrapper component for widgets that handles loading, empty, and error states
 */
export function WidgetDataStatus({
  isLoading,
  hasData,
  emptyMessage = "No data available. Import data to see analytics.",
  errorMessage,
  children,
}: WidgetDataStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-center">
          <Database className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
