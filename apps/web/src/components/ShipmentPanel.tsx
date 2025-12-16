// =============================================================================
// SHIPMENT PANEL
// Manage shipments for an order - create, view, update status
// =============================================================================

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/api/client";

// =============================================================================
// TYPES
// =============================================================================

type ShipmentStatus =
  | "pending"
  | "label_created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

type CarrierType = "ups" | "fedex" | "usps" | "dhl" | "other";

interface TrackingEvent {
  id: string;
  status: string;
  description: string;
  location: string | null;
  eventTime: string;
}

interface ShipmentItem {
  id: string;
  productId: string;
  quantityPacks: number;
  quantityUnits: number;
  product?: {
    name: string;
    productId: string;
  };
}

interface Shipment {
  id: string;
  orderRequestId: string;
  clientId: string;
  carrier: CarrierType;
  carrierName: string | null;
  trackingNumber: string;
  trackingUrl: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  packageCount: number;
  serviceLevel: string | null;
  exceptionReason: string | null;
  trackingEvents?: TrackingEvent[];
  shipmentItems?: ShipmentItem[];
}

interface ShipmentPanelProps {
  orderRequestId: string;
  clientId: string;
  onShipmentCreated?: () => void;
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const statusConfig: Record<
  ShipmentStatus,
  { label: string; color: string; icon: typeof Package; bg: string }
> = {
  pending: {
    label: "Pending",
    color: "text-gray-600",
    icon: Clock,
    bg: "bg-gray-100",
  },
  label_created: {
    label: "Label Created",
    color: "text-blue-600",
    icon: Package,
    bg: "bg-blue-100",
  },
  in_transit: {
    label: "In Transit",
    color: "text-purple-600",
    icon: Truck,
    bg: "bg-purple-100",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "text-amber-600",
    icon: Truck,
    bg: "bg-amber-100",
  },
  delivered: {
    label: "Delivered",
    color: "text-emerald-600",
    icon: CheckCircle,
    bg: "bg-emerald-100",
  },
  exception: {
    label: "Exception",
    color: "text-red-600",
    icon: AlertTriangle,
    bg: "bg-red-100",
  },
};

const carrierOptions: { value: CarrierType; label: string }[] = [
  { value: "ups", label: "UPS" },
  { value: "fedex", label: "FedEx" },
  { value: "usps", label: "USPS" },
  { value: "dhl", label: "DHL" },
  { value: "other", label: "Other" },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function ShipmentPanel({
  orderRequestId,
  clientId,
  onShipmentCreated,
}: ShipmentPanelProps) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    carrier: "ups" as CarrierType,
    carrierName: "",
    trackingNumber: "",
    estimatedDelivery: "",
    serviceLevel: "",
    destinationCity: "",
    destinationState: "",
    packageCount: 1,
  });

  // Fetch shipments for the order
  const { data: shipments, isLoading } = useQuery({
    queryKey: ["shipments", "order", orderRequestId],
    queryFn: async () => {
      const response = await api.get<{ data: Shipment[] }>(
        `/shipments/order/${orderRequestId}`,
      );
      return response.data;
    },
  });

  // Create shipment mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await api.post("/shipments", {
        orderRequestId,
        clientId,
        ...data,
        estimatedDelivery: data.estimatedDelivery || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["shipments", "order", orderRequestId],
      });
      setShowCreateForm(false);
      setFormData({
        carrier: "ups",
        carrierName: "",
        trackingNumber: "",
        estimatedDelivery: "",
        serviceLevel: "",
        destinationCity: "",
        destinationState: "",
        packageCount: 1,
      });
      onShipmentCreated?.();
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      shipmentId,
      status,
    }: {
      shipmentId: string;
      status: ShipmentStatus;
    }) => {
      return await api.post(`/shipments/${shipmentId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["shipments", "order", orderRequestId],
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.trackingNumber) return;
    createMutation.mutate(formData);
  };

  const handleStatusChange = (
    shipmentId: string,
    newStatus: ShipmentStatus,
  ) => {
    updateStatusMutation.mutate({ shipmentId, status: newStatus });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">Shipments</h3>
            {shipments && shipments.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {shipments.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            {showCreateForm ? (
              <>
                <X className="w-4 h-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Shipment
              </>
            )}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <form
          onSubmit={handleSubmit}
          className="p-4 bg-gray-50 border-b border-gray-200"
        >
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Carrier *
              </label>
              <select
                value={formData.carrier}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    carrier: e.target.value as CarrierType,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {carrierOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tracking Number *
              </label>
              <input
                type="text"
                value={formData.trackingNumber}
                onChange={(e) =>
                  setFormData({ ...formData, trackingNumber: e.target.value })
                }
                placeholder="1Z999AA10123456784"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Est. Delivery
              </label>
              <input
                type="date"
                value={formData.estimatedDelivery}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    estimatedDelivery: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Service Level
              </label>
              <input
                type="text"
                value={formData.serviceLevel}
                onChange={(e) =>
                  setFormData({ ...formData, serviceLevel: e.target.value })
                }
                placeholder="Ground, 2-Day, Overnight"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Destination City
              </label>
              <input
                type="text"
                value={formData.destinationCity}
                onChange={(e) =>
                  setFormData({ ...formData, destinationCity: e.target.value })
                }
                placeholder="Los Angeles"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Destination State
              </label>
              <input
                type="text"
                value={formData.destinationState}
                onChange={(e) =>
                  setFormData({ ...formData, destinationState: e.target.value })
                }
                placeholder="CA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !formData.trackingNumber}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create Shipment"}
            </button>
          </div>
        </form>
      )}

      {/* Shipments List */}
      <div className="divide-y divide-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            Loading shipments...
          </div>
        ) : shipments && shipments.length > 0 ? (
          shipments.map((shipment) => {
            const config = statusConfig[shipment.status];
            const StatusIcon = config.icon;
            const isExpanded = expandedShipment === shipment.id;

            return (
              <div key={shipment.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <StatusIcon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {shipment.carrier.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {shipment.trackingNumber}
                        </span>
                        {shipment.trackingUrl && (
                          <a
                            href={shipment.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className={`font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        {shipment.estimatedDelivery && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Est.{" "}
                            {format(
                              new Date(shipment.estimatedDelivery),
                              "MMM d",
                            )}
                          </span>
                        )}
                        {shipment.destinationCity && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {shipment.destinationCity},{" "}
                            {shipment.destinationState}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={shipment.status}
                      onChange={(e) =>
                        handleStatusChange(
                          shipment.id,
                          e.target.value as ShipmentStatus,
                        )
                      }
                      className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Object.entries(statusConfig).map(([value, cfg]) => (
                        <option key={value} value={value}>
                          {cfg.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        setExpandedShipment(isExpanded ? null : shipment.id)
                      }
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {isExpanded ? "Hide" : "Details"}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {/* Tracking Timeline */}
                    {shipment.trackingEvents &&
                      shipment.trackingEvents.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs font-medium text-gray-700 mb-2">
                            Tracking History
                          </h4>
                          <div className="space-y-2">
                            {shipment.trackingEvents
                              .slice(0, 5)
                              .map((event) => (
                                <div
                                  key={event.id}
                                  className="flex items-start gap-2 text-xs"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5" />
                                  <div>
                                    <span className="font-medium text-gray-700">
                                      {event.description}
                                    </span>
                                    {event.location && (
                                      <span className="text-gray-500">
                                        {" "}
                                        - {event.location}
                                      </span>
                                    )}
                                    <span className="text-gray-400 block">
                                      {formatDistanceToNow(
                                        new Date(event.eventTime),
                                        { addSuffix: true },
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                    {/* Shipment Items */}
                    {shipment.shipmentItems &&
                      shipment.shipmentItems.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-700 mb-2">
                            Items
                          </h4>
                          <div className="space-y-1">
                            {shipment.shipmentItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-gray-600">
                                  {item.product?.name || item.productId}
                                </span>
                                <span className="text-gray-500">
                                  {item.quantityPacks} packs (
                                  {item.quantityUnits} units)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No shipments yet</p>
            <p className="text-xs text-gray-400">
              Create a shipment to start tracking
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShipmentPanel;
