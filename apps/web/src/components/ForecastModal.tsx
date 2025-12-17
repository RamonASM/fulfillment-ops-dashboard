// =============================================================================
// FORECAST MODAL
// Modal displaying ML predictions with demand forecast and stockout charts
// =============================================================================

import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Brain,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { DemandForecastChart } from "@/components/widgets/DemandForecastChart";
import { StockoutPredictionChart } from "@/components/widgets/StockoutPredictionChart";
import { useNavigate } from "react-router-dom";

export interface ForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currentStock: number;
}

export function ForecastModal({
  isOpen,
  onClose,
  productId,
  productName,
  currentStock,
}: ForecastModalProps) {
  const navigate = useNavigate();

  const handleViewMLAnalytics = () => {
    navigate("/ml-analytics");
    onClose();
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
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    AI Predictions
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5">{productName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleViewMLAnalytics}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  ML Analytics
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                {/* Info Banner */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 text-sm text-blue-800">
                      <p className="font-medium mb-1">AI-Powered Predictions</p>
                      <p>
                        These forecasts use Facebook Prophet machine learning to
                        analyze historical usage patterns and predict future
                        demand. Predictions update daily based on the latest
                        transaction data.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Demand Forecast */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Demand Forecast
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      30-day prediction of expected usage based on historical
                      patterns
                    </p>
                    <div className="bg-white rounded-lg">
                      <DemandForecastChart
                        productId={productId}
                        productName={productName}
                        horizonDays={30}
                        showMetrics={true}
                      />
                    </div>
                  </div>

                  {/* Stockout Prediction */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Stockout Risk
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      90-day prediction of when inventory will run out
                    </p>
                    <div className="bg-white rounded-lg">
                      <StockoutPredictionChart
                        productId={productId}
                        productName={productName}
                        currentStock={currentStock}
                        horizonDays={90}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    <p>
                      Predictions are generated using historical transaction
                      data.
                    </p>
                    <p className="mt-1">
                      Accuracy improves with more data (30+ days recommended).
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Implement order creation
                        console.log("Create order for:", productId);
                      }}
                      className="px-4 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors"
                    >
                      Create Reorder
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ForecastModal;
