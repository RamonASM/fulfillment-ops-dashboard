// =============================================================================
// HELP PAGE (PORTAL - CLIENT)
// Comprehensive help and documentation for client users
// =============================================================================

import { HelpDashboard } from "@inventory/shared";
import { useSearchParams } from "react-router-dom";

export default function Help() {
  const [searchParams] = useSearchParams();
  const initialSlug = searchParams.get("article") || undefined;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <HelpDashboard
        audience="client"
        theme="emerald"
        initialSlug={initialSlug}
      />
    </div>
  );
}
