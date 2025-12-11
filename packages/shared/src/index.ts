// =============================================================================
// INVENTORY INTELLIGENCE PLATFORM - SHARED TYPES
// =============================================================================

// -----------------------------------------------------------------------------
// USER & AUTH TYPES
// -----------------------------------------------------------------------------

export type UserRole = 'admin' | 'operations_manager' | 'account_manager';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;
}

export interface UserSettings {
  theme?: 'light' | 'dark' | 'system';
  notifications?: {
    email: boolean;
    push: boolean;
    alertTypes: AlertType[];
  };
  dashboard?: {
    defaultView: 'grid' | 'list';
    showOrphans: boolean;
  };
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'settings'>;
  accessToken: string;
}

// -----------------------------------------------------------------------------
// CLIENT TYPES
// -----------------------------------------------------------------------------

export interface Client {
  id: string;
  name: string;
  code: string;
  settings: ClientSettings;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ClientSettings {
  reorderLeadDays: number;
  safetyStockWeeks: number;
  serviceLevelTarget: number;
  showOrphanProducts: boolean;
}

export interface ClientWithStats extends Client {
  stats: ClientStats;
}

export interface ClientStats {
  totalProducts: number;
  healthyCount: number;
  watchCount: number;
  lowCount: number;
  criticalCount: number;
  stockoutCount: number;
  alertCount: number;
}

// -----------------------------------------------------------------------------
// PRODUCT TYPES
// -----------------------------------------------------------------------------

export type ItemType = 'evergreen' | 'event' | 'completed';
export type CalculationBasis = '12-mo' | '3-mo' | 'weekly' | 'manual';
export type StockStatus = 'healthy' | 'watch' | 'low' | 'critical' | 'stockout';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Product {
  id: string;
  clientId: string;
  productId: string;
  name: string;
  itemType: ItemType;
  packSize: number;
  notificationPoint?: number;
  currentStockPacks: number;
  currentStockUnits: number;
  reorderPointPacks?: number;
  reorderPointUnits?: number;
  calculationBasis?: CalculationBasis;
  isActive: boolean;
  isOrphan: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithMetrics extends Product {
  usage: UsageMetrics;
  status: StockStatusInfo;
  riskScore?: number;
}

export interface UsageMetrics {
  calculationBasis: CalculationBasis;
  avgMonthlyUnits: number;
  avgDailyUnits: number;
  avgWeeklyUnits: number;
  confidence: ConfidenceLevel;
  dataPointCount: number;
  calculatedAt: Date;
}

export interface StockStatusInfo {
  level: StockStatus;
  weeksRemaining: number;
  color: string;
  percentOfReorderPoint: number;
}

export interface StockDisplay {
  packsAvailable: number;
  packSize: number;
  totalUnits: number;
  displayText: string;
}

// -----------------------------------------------------------------------------
// TRANSACTION TYPES
// -----------------------------------------------------------------------------

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

export interface Transaction {
  id: string;
  productId: string;
  orderId: string;
  quantityPacks: number;
  quantityUnits: number;
  dateSubmitted: Date;
  orderStatus: OrderStatus;
  shipToLocation?: string;
  shipToCompany?: string;
  importBatchId?: string;
  createdAt: Date;
}

// -----------------------------------------------------------------------------
// ALERT TYPES
// -----------------------------------------------------------------------------

export type AlertType =
  | 'stockout'
  | 'critical_stock'
  | 'low_stock'
  | 'reorder_due'
  | 'usage_spike'
  | 'no_movement';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  clientId: string;
  productId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  message?: string;
  thresholdValue?: number;
  currentValue?: number;
  isRead: boolean;
  isDismissed: boolean;
  dismissedBy?: string;
  dismissedAt?: Date;
  createdAt: Date;
}

export interface AlertWithProduct extends Alert {
  product?: Pick<Product, 'productId' | 'name'>;
  client?: Pick<Client, 'name' | 'code'>;
}

// -----------------------------------------------------------------------------
// IMPORT TYPES
// -----------------------------------------------------------------------------

export type ImportType = 'inventory' | 'orders' | 'both';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ImportBatch {
  id: string;
  clientId: string;
  importType: ImportType;
  filename?: string;
  filePath?: string;
  status: ImportStatus;
  rowCount?: number;
  processedCount: number;
  errorCount: number;
  errors: ImportError[];
  importedBy?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  value?: string;
}

export interface ImportPreview {
  importId: string;
  detectedType: ImportType;
  rowCount: number;
  columns: ColumnMapping[];
  sampleRows: Record<string, unknown>[];
  warnings: ImportWarning[];
}

export interface ColumnMapping {
  source: string;
  mapsTo: string;
  confidence: number;
}

export interface ImportWarning {
  type: 'whitespace' | 'format' | 'duplicate' | 'missing';
  message: string;
  affectedRows: number;
}

// -----------------------------------------------------------------------------
// REPORT TYPES
// -----------------------------------------------------------------------------

export interface InventorySnapshot {
  clientId: string;
  generatedAt: Date;
  totalProducts: number;
  totalValue?: number;
  statusBreakdown: Record<StockStatus, number>;
  products: ProductWithMetrics[];
}

export interface UsageTrendReport {
  clientId: string;
  period: 'weekly' | 'monthly' | 'quarterly';
  startDate: Date;
  endDate: Date;
  dataPoints: TrendDataPoint[];
}

export interface TrendDataPoint {
  date: Date;
  totalConsumed: number;
  productCount: number;
}

// -----------------------------------------------------------------------------
// AI FEATURE TYPES
// -----------------------------------------------------------------------------

export interface RiskScore {
  productId: string;
  score: number; // 0-100
  factors: RiskFactor[];
  calculatedAt: Date;
}

export interface RiskFactor {
  name: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
}

export interface DemandForecast {
  productId: string;
  forecastPeriod: 'weekly' | 'monthly';
  predictions: ForecastPrediction[];
  confidence: number;
  model: string;
}

export interface ForecastPrediction {
  date: Date;
  predictedUnits: number;
  lowerBound: number;
  upperBound: number;
}

export interface AISummary {
  clientId: string;
  generatedAt: Date;
  summary: string;
  highlights: string[];
  recommendations: string[];
}

export interface ConversationalQuery {
  query: string;
  response: string;
  data?: unknown;
  suggestedActions?: string[];
}

// -----------------------------------------------------------------------------
// API RESPONSE TYPES
// -----------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// STATUS COLOR CONSTANTS
// -----------------------------------------------------------------------------

export const STATUS_COLORS: Record<StockStatus, string> = {
  healthy: '#10B981',
  watch: '#3B82F6',
  low: '#F59E0B',
  critical: '#DC2626',
  stockout: '#991B1B',
};

export const STATUS_ICONS: Record<StockStatus, string> = {
  healthy: '✓',
  watch: '○',
  low: '↓',
  critical: '⚡',
  stockout: '✕',
};

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: '#3B82F6',
  warning: '#F59E0B',
  critical: '#DC2626',
};
