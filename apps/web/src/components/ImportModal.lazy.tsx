import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load the heavy ImportModal component
const ImportModalComponent = lazy(() => import("./ImportModal").then(module => ({ default: module.ImportModal })));

// Loading fallback for the modal
function ModalLoader() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-8">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-gray-600">Loading import wizard...</p>
        </div>
      </div>
    </div>
  );
}

// Props type - matches ImportModal props
interface ImportModalLazyProps {
  clientId: string;
  clientName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Lazy-loaded wrapper component
export function ImportModal(props: ImportModalLazyProps) {
  // Only load the component when modal is open
  if (!props.isOpen) {
    return null;
  }

  return (
    <Suspense fallback={<ModalLoader />}>
      <ImportModalComponent {...props} />
    </Suspense>
  );
}
