// =============================================================================
// NOTIFICATION SETTINGS PAGE
// User interface for managing notification preferences
// =============================================================================

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell,
  Mail,
  Smartphone,
  MessageSquare,
  Clock,
  RefreshCw,
  Save,
  CheckCircle,
} from "lucide-react";
import { api } from "@/api/client";
import { fadeInUp } from "@/lib/animations";

interface NotificationPreference {
  id: string;
  userId: string;
  userType: "User" | "PortalUser";
  isActive: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  eventPreferences: {
    order_deadline?: boolean;
    stockout_alert?: boolean;
    alert_created?: boolean;
    order_status?: boolean;
    stock_status?: boolean;
  };
  digestFrequency: "disabled" | "daily" | "weekly";
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch current preferences
  const { data: prefsData, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotificationPreference>("/notification-preferences"),
  });

  const preferences = prefsData || null;

  // Local state for form
  const [formData, setFormData] = useState<Partial<NotificationPreference>>(
    preferences || {},
  );

  // Update local state when data loads
  useState(() => {
    if (preferences) {
      setFormData(preferences);
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (updates: Partial<NotificationPreference>) =>
      api.patch("/notification-preferences", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => api.post("/notification-preferences/reset", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setHasChanges(false);
    },
  });

  const handleChannelToggle = (channel: "email" | "push" | "inApp") => {
    const key = `${channel}Enabled` as keyof NotificationPreference;
    setFormData((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setHasChanges(true);
  };

  const handleEventToggle = (eventType: string) => {
    setFormData((prev) => ({
      ...prev,
      eventPreferences: {
        ...prev.eventPreferences,
        [eventType]: !(prev.eventPreferences as Record<string, boolean>)?.[
          eventType
        ],
      },
    }));
    setHasChanges(true);
  };

  const handleDigestChange = (frequency: "disabled" | "daily" | "weekly") => {
    setFormData((prev) => ({
      ...prev,
      digestFrequency: frequency,
    }));
    setHasChanges(true);
  };

  const handleQuietHoursToggle = () => {
    setFormData((prev) => ({
      ...prev,
      quietHoursEnabled: !prev.quietHoursEnabled,
    }));
    setHasChanges(true);
  };

  const handleQuietHoursChange = (field: "start" | "end", value: string) => {
    const key = field === "start" ? "quietHoursStart" : "quietHoursEnd";
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (
      confirm(
        "Are you sure you want to reset all notification settings to defaults?",
      )
    ) {
      resetMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const eventTypes = [
    {
      key: "order_deadline",
      label: "Order Deadlines",
      description: "Alerts when products need to be ordered soon",
    },
    {
      key: "stockout_alert",
      label: "Stockout Alerts",
      description: "Critical notifications for out-of-stock products",
    },
    {
      key: "alert_created",
      label: "New Alerts",
      description: "General alerts and anomaly detection notifications",
    },
    {
      key: "order_status",
      label: "Order Status Updates",
      description:
        "Updates when order requests are approved, rejected, or fulfilled",
    },
    {
      key: "stock_status",
      label: "Stock Level Changes",
      description: "Notifications when product stock levels change",
    },
  ];

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              Notification Settings
            </h1>
          </div>
          <p className="text-gray-500 mt-1">
            Manage how you receive alerts and updates
          </p>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4 inline mr-1" />
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {updateMutation.isPending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}

        {saveSuccess && (
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <CheckCircle className="w-5 h-5" />
            Saved successfully!
          </div>
        )}
      </div>

      {/* Notification Channels */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Notification Channels
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">Email Notifications</p>
                <p className="text-sm text-gray-500">
                  Receive alerts via email
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChannelToggle("email")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.emailEnabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.emailEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">Push Notifications</p>
                <p className="text-sm text-gray-500">
                  Receive alerts on your device
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChannelToggle("push")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.pushEnabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.pushEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-medium text-gray-900">
                  In-App Notifications
                </p>
                <p className="text-sm text-gray-500">
                  Show alerts in the dashboard
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChannelToggle("inApp")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                formData.inAppEnabled ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.inAppEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Event Types */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Notification Types
        </h2>
        <div className="space-y-3">
          {eventTypes.map((event) => (
            <div
              key={event.key}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{event.label}</p>
                <p className="text-sm text-gray-500">{event.description}</p>
              </div>
              <button
                onClick={() => handleEventToggle(event.key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  (formData.eventPreferences as Record<string, boolean>)?.[
                    event.key
                  ]
                    ? "bg-blue-600"
                    : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    (formData.eventPreferences as Record<string, boolean>)?.[
                      event.key
                    ]
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Digest Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Email Digest
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Group non-urgent notifications into periodic summaries
        </p>
        <div className="flex gap-3">
          {(["disabled", "daily", "weekly"] as const).map((freq) => (
            <button
              key={freq}
              onClick={() => handleDigestChange(freq)}
              className={`px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                formData.digestFrequency === freq
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {freq.charAt(0).toUpperCase() + freq.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Quiet Hours</h2>
          </div>
          <button
            onClick={handleQuietHoursToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formData.quietHoursEnabled ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formData.quietHoursEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Pause non-critical notifications during specific hours
        </p>

        {formData.quietHoursEnabled && (
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formData.quietHoursStart || "22:00"}
                onChange={(e) =>
                  handleQuietHoursChange("start", e.target.value)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                type="time"
                value={formData.quietHoursEnd || "08:00"}
                onChange={(e) => handleQuietHoursChange("end", e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
