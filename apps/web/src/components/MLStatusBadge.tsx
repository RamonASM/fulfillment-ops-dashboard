// =============================================================================
// ML STATUS BADGE
// Shows ML analytics service health status
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { Brain, AlertCircle } from "lucide-react";
import { api } from "@/api/client";
import { clsx } from "clsx";

interface MLHealthResponse {
  status: "healthy" | "degraded" | "offline";
  service: string;
  database?: string;
}

interface MLStatusBadgeProps {
  showLabel?: boolean;
  className?: string;
}

export function MLStatusBadge({
  showLabel = true,
  className,
}: MLStatusBadgeProps) {
  // Check ML service health
  const { data: mlHealth, isLoading } = useQuery({
    queryKey: ["ml-health"],
    queryFn: () => api.get<MLHealthResponse>("/ml/health"),
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
    // Don't show errors in UI - ML is optional
    meta: { hideError: true },
  });

  const isHealthy = mlHealth?.status === "healthy";
  const isOffline = !mlHealth || mlHealth?.status === "offline";

  if (isLoading) {
    return (
      <div
        className={clsx(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
          "bg-gray-100 text-gray-600",
          className,
        )}
      >
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
        {showLabel && <span>ML Checking...</span>}
      </div>
    );
  }

  if (isOffline) {
    return (
      <div
        className={clsx(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
          "bg-red-100 text-red-700",
          className,
        )}
        title="ML Analytics service is offline. AI predictions unavailable."
      >
        <AlertCircle className="w-3 h-3" />
        {showLabel && <span>ML Offline</span>}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        isHealthy
          ? "bg-green-100 text-green-700"
          : "bg-yellow-100 text-yellow-700",
        className,
      )}
      title={
        isHealthy
          ? "ML Analytics service is active. AI predictions available."
          : "ML Analytics service is degraded. Some features may be unavailable."
      }
    >
      <Brain className="w-3 h-3" />
      {showLabel && <span>{isHealthy ? "ML Active" : "ML Degraded"}</span>}
    </div>
  );
}

export default MLStatusBadge;
