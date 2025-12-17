// =============================================================================
// HELP PAGE (WEB APP - ADMIN)
// Comprehensive help and documentation for admins/account managers
// =============================================================================

import { HelpDashboard } from "@inventory/shared/components/help";
import { useSearchParams } from "react-router-dom";

export default function Help() {
  const [searchParams] = useSearchParams();
  const initialSlug = searchParams.get("article") || undefined;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <HelpDashboard audience="admin" theme="blue" initialSlug={initialSlug} />
    </div>
  );
}
