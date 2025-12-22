// =============================================================================
// CLIENT SETTINGS MODAL
// Modal for editing client details and AI configuration
// Extracted from ClientDetail.tsx for maintainability
// =============================================================================

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader2,
  Trash2,
  Brain,
  Key,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/api/client";
import toast from "react-hot-toast";

// =============================================================================
// TYPES
// =============================================================================

interface AISettings {
  useOwnAiKey: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  encryptionConfigured: boolean;
  platformKeyConfigured: boolean;
}

interface ClientSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteClick: () => void;
  clientId: string;
  clientName: string;
  clientCode: string;
  canEditAiSettings: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClientSettingsModal({
  isOpen,
  onClose,
  onDeleteClick,
  clientId,
  clientName,
  clientCode,
  canEditAiSettings,
}: ClientSettingsModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [editName, setEditName] = useState(clientName);
  const [editCode, setEditCode] = useState(clientCode);
  const [useOwnAiKey, setUseOwnAiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Fetch AI settings
  const { data: aiSettings, isLoading: aiSettingsLoading } = useQuery({
    queryKey: ["client-ai-settings", clientId],
    queryFn: () => api.get<AISettings>(`/clients/${clientId}/ai-settings`),
    enabled: isOpen && !!clientId,
  });

  // Sync form state when modal opens or data changes
  useEffect(() => {
    if (isOpen) {
      setEditName(clientName);
      setEditCode(clientCode);
      setApiKeyInput("");
      setShowApiKey(false);
    }
  }, [isOpen, clientName, clientCode]);

  useEffect(() => {
    if (aiSettings) {
      setUseOwnAiKey(aiSettings.useOwnAiKey);
    }
  }, [aiSettings]);

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      return api.patch(`/clients/${clientId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client updated successfully");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update client");
    },
  });

  // Update AI settings mutation
  const updateAiSettingsMutation = useMutation({
    mutationFn: async (data: {
      useOwnAiKey: boolean;
      anthropicApiKey?: string;
    }) => {
      return api.patch(`/clients/${clientId}/ai-settings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-ai-settings", clientId],
      });
      toast.success("AI settings updated successfully");
      setApiKeyInput("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update AI settings");
    },
  });

  // Delete AI key mutation
  const deleteAiKeyMutation = useMutation({
    mutationFn: async () => {
      return api.delete(`/clients/${clientId}/ai-settings/key`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-ai-settings", clientId],
      });
      toast.success("API key removed");
      setUseOwnAiKey(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove API key");
    },
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editCode.trim()) {
      toast.error("Name and code are required");
      return;
    }
    updateClientMutation.mutate({
      name: editName.trim(),
      code: editCode.trim().toUpperCase(),
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2
                id="settings-modal-title"
                className="text-lg font-semibold text-gray-900"
              >
                Client Settings
              </h2>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close settings modal"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Client Name */}
              <div>
                <label
                  htmlFor="client-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Client Name
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter client name"
                />
              </div>

              {/* Client Code */}
              <div>
                <label
                  htmlFor="client-code"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Client Code
                </label>
                <input
                  id="client-code"
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono uppercase"
                  placeholder="e.g., ACME"
                  maxLength={10}
                />
              </div>

              {/* AI Settings Section */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="w-5 h-5 text-purple-600" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    AI Import Mapping
                  </h3>
                </div>

                {/* AI Status Indicator */}
                <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                  {aiSettingsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : aiSettings?.platformKeyConfigured ||
                    aiSettings?.hasApiKey ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm text-gray-600">
                    {aiSettingsLoading
                      ? "Checking AI status..."
                      : aiSettings?.useOwnAiKey && aiSettings?.hasApiKey
                        ? "Using client's own API key"
                        : aiSettings?.platformKeyConfigured
                          ? "Using platform AI (included)"
                          : "AI mapping not available"}
                  </span>
                </div>

                {/* Use Own Key Toggle */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <label
                      htmlFor="use-own-key"
                      className="text-sm font-medium text-gray-700"
                    >
                      Use own Anthropic API key
                    </label>
                    <p className="text-xs text-gray-500">
                      {canEditAiSettings
                        ? "Enterprise clients can provide their own key"
                        : "Contact admin to configure API key"}
                    </p>
                  </div>
                  <button
                    id="use-own-key"
                    type="button"
                    role="switch"
                    aria-checked={useOwnAiKey}
                    onClick={() =>
                      canEditAiSettings && setUseOwnAiKey(!useOwnAiKey)
                    }
                    disabled={!canEditAiSettings}
                    className={clsx(
                      "relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
                      useOwnAiKey ? "bg-primary-600" : "bg-gray-200",
                      canEditAiSettings
                        ? "cursor-pointer"
                        : "cursor-not-allowed opacity-50"
                    )}
                  >
                    <span
                      className={clsx(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        useOwnAiKey ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* API Key Input - Only shown when toggle is on and user can edit */}
                {useOwnAiKey && canEditAiSettings && (
                  <div className="space-y-3">
                    {aiSettings?.hasApiKey && (
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-700 font-mono">
                            {aiSettings.apiKeyMasked}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteAiKeyMutation.mutate()}
                          disabled={deleteAiKeyMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          {deleteAiKeyMutation.isPending
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="api-key"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        {aiSettings?.hasApiKey
                          ? "Replace API Key"
                          : "Anthropic API Key"}
                      </label>
                      <div className="relative">
                        <input
                          id="api-key"
                          type={showApiKey ? "text" : "password"}
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                          placeholder="sk-ant-api03-..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                          aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        >
                          {showApiKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Get your API key from{" "}
                        <a
                          href="https://console.anthropic.com/settings/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700"
                        >
                          console.anthropic.com
                        </a>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        updateAiSettingsMutation.mutate({
                          useOwnAiKey: true,
                          anthropicApiKey: apiKeyInput || undefined,
                        });
                      }}
                      disabled={
                        updateAiSettingsMutation.isPending ||
                        (!apiKeyInput && !aiSettings?.hasApiKey)
                      }
                      className="w-full btn-secondary btn-sm"
                    >
                      {updateAiSettingsMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4 mr-2" />
                          {apiKeyInput ? "Save API Key" : "Enable Own Key"}
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Show existing key info to non-admins (read-only) */}
                {useOwnAiKey && !canEditAiSettings && aiSettings?.hasApiKey && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Key className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 font-mono">
                      {aiSettings.apiKeyMasked}
                    </span>
                  </div>
                )}

                {/* Save toggle state when turning off (admin only) */}
                {!useOwnAiKey && aiSettings?.useOwnAiKey && canEditAiSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      updateAiSettingsMutation.mutate({
                        useOwnAiKey: false,
                      });
                    }}
                    disabled={updateAiSettingsMutation.isPending}
                    className="w-full btn-secondary btn-sm"
                  >
                    {updateAiSettingsMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Switching...
                      </>
                    ) : (
                      "Switch to Platform AI"
                    )}
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDeleteClick();
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Client
                </button>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateClientMutation.isPending}
                    className="btn-primary"
                  >
                    {updateClientMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ClientSettingsModal;
