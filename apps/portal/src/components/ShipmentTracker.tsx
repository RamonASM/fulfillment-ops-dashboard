// =============================================================================
// SHIPMENT TRACKER
// Track shipments and view tracking timeline for portal users
// =============================================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";

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
  carrier: string;
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

interface ShipmentTrackerProps {
  orderRequestId?: string;
  showAll?: boolean;
  limit?: number;
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const statusConfig: Record<
  ShipmentStatus,
  {
    label: string;
    color: string;
    icon: typeof Package;
    bg: string;
    step: number;
  }
> = {
  pending: {
    label: "Pending",
    color: "text-gray-600",
    icon: Clock,
    bg: "bg-gray-100",
    step: 0,
  },
  label_created: {
    label: "Label Created",
    color: "text-blue-600",
    icon: Package,
    bg: "bg-blue-100",
    step: 1,
  },
  in_transit: {
    label: "In Transit",
    color: "text-purple-600",
    icon: Truck,
    bg: "bg-purple-100",
    step: 2,
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "text-amber-600",
    icon: Truck,
    bg: "bg-amber-100",
    step: 3,
  },
  delivered: {
    label: "Delivered",
    color: "text-emerald-600",
    icon: CheckCircle,
    bg: "bg-emerald-100",
    step: 4,
  },
  exception: {
    label: "Exception",
    color: "text-red-600",
    icon: AlertTriangle,
    bg: "bg-red-100",
    step: -1,
  },
};

const statusSteps = [
  "pending",
  "label_created",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

// =============================================================================
// COMPONENT
// =============================================================================

export function ShipmentTracker({
  orderRequestId,
  showAll = false,
  limit = 5,
}: ShipmentTrackerProps) {
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);

  // Fetch shipments
  const { data: shipments, isLoading } = useQuery({
    queryKey: orderRequestId
      ? ["portal", "shipments", "order", orderRequestId]
      : ["portal", "shipments", "active"],
    queryFn: async () => {
      const endpoint = orderRequestId
        ? `/portal/shipments/order/${orderRequestId}`
        : "/portal/shipments/active";
      const response = await api.get(endpoint);
      return response.data.data as Shipment[];
    },
  });

  const displayShipments = showAll ? shipments : shipments?.slice(0, limit);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">
            {orderRequestId ? "Order Shipments" : "Active Shipments"}
          </h3>
          {displayShipments && displayShipments.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {displayShipments.length}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {displayShipments && displayShipments.length > 0 ? (
          displayShipments.map((shipment) => {
            const config = statusConfig[shipment.status];
            const StatusIcon = config.icon;
            const isExpanded = expandedShipment === shipment.id;
            const currentStep = config.step;

            return (
              <div key={shipment.id} className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${config.color}`} />
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
                            title="Track on carrier website"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {shipment.estimatedDelivery && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Est. delivery:{" "}
                            {format(
                              new Date(shipment.estimatedDelivery),
                              "MMM d, yyyy",
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
                  <button
                    onClick={() =>
                      setExpandedShipment(isExpanded ? null : shipment.id)
                    }
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    {isExpanded ? (
                      <>
                        Hide details <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        View details <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                {/* Progress Steps */}
                {shipment.status !== "exception" && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      {statusSteps.map((step, index) => {
                        const stepConfig = statusConfig[step as ShipmentStatus];
                        const isCompleted = index <= currentStep;
                        const isCurrent = index === currentStep;

                        return (
                          <div key={step} className="flex-1 flex items-center">
                            <div className="flex flex-col items-center flex-1">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  isCompleted
                                    ? isCurrent
                                      ? "bg-blue-500 text-white"
                                      : "bg-emerald-500 text-white"
                                    : "bg-gray-200 text-gray-400"
                                }`}
                              >
                                {isCompleted && !isCurrent ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <stepConfig.icon className="w-4 h-4" />
                                )}
                              </div>
                              <span
                                className={`text-xs mt-1 text-center ${
                                  isCompleted
                                    ? "text-gray-700 font-medium"
                                    : "text-gray-400"
                                }`}
                              >
                                {stepConfig.label}
                              </span>
                            </div>
                            {index < statusSteps.length - 1 && (
                              <div
                                className={`h-0.5 flex-1 mx-2 ${
                                  index < currentStep
                                    ? "bg-emerald-500"
                                    : "bg-gray-200"
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Exception Alert */}
                {shipment.status === "exception" && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">Delivery Exception</span>
                    </div>
                    {shipment.exceptionReason && (
                      <p className="text-sm text-red-600 mt-1">
                        {shipment.exceptionReason}
                      </p>
                    )}
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    {/* Tracking Timeline */}
                    {shipment.trackingEvents &&
                      shipment.trackingEvents.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">
                            Tracking History
                          </h4>
                          <div className="relative">
                            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200" />
                            <div className="space-y-4">
                              {shipment.trackingEvents.map((event, index) => (
                                <div
                                  key={event.id}
                                  className="flex items-start gap-3 relative"
                                >
                                  <div
                                    className={`w-4 h-4 rounded-full border-2 z-10 ${
                                      index === 0
                                        ? "bg-blue-500 border-blue-500"
                                        : "bg-white border-gray-300"
                                    }`}
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                      {event.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                      {event.location && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {event.location}
                                        </span>
                                      )}
                                      <span>
                                        {formatDistanceToNow(
                                          new Date(event.eventTime),
                                          { addSuffix: true },
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Shipment Items */}
                    {shipment.shipmentItems &&
                      shipment.shipmentItems.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Items in this shipment
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="space-y-2">
                              {shipment.shipmentItems.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span className="text-gray-700">
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
                        </div>
                      )}

                    {/* Shipment Details */}
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      {shipment.serviceLevel && (
                        <div>
                          <span className="text-gray-500">Service Level:</span>
                          <span className="ml-2 text-gray-900">
                            {shipment.serviceLevel}
                          </span>
                        </div>
                      )}
                      {shipment.packageCount > 1 && (
                        <div>
                          <span className="text-gray-500">Packages:</span>
                          <span className="ml-2 text-gray-900">
                            {shipment.packageCount}
                          </span>
                        </div>
                      )}
                      {shipment.shippedAt && (
                        <div>
                          <span className="text-gray-500">Shipped:</span>
                          <span className="ml-2 text-gray-900">
                            {format(
                              new Date(shipment.shippedAt),
                              "MMM d, yyyy h:mm a",
                            )}
                          </span>
                        </div>
                      )}
                      {shipment.deliveredAt && (
                        <div>
                          <span className="text-gray-500">Delivered:</span>
                          <span className="ml-2 text-gray-900">
                            {format(
                              new Date(shipment.deliveredAt),
                              "MMM d, yyyy h:mm a",
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No shipments to track</p>
            <p className="text-sm text-gray-400 mt-1">
              Shipment information will appear here once your order ships
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShipmentTracker;
