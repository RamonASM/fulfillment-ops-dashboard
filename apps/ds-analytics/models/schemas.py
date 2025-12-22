"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

# Request Schemas

class CalculateUsageRequest(BaseModel):
    product_ids: List[str] = Field(..., description="List of product IDs to calculate usage for")
    client_id: str = Field(..., description="Client ID")
    force_recalculate: bool = Field(default=False, description="Force recalculation even if recent data exists")

class RecalculateClientRequest(BaseModel):
    include_inactive: bool = Field(default=False, description="Include inactive products")

# Response Schemas

class ValidationMessage(BaseModel):
    level: str  # 'error' | 'warning' | 'info'
    message: str

class ReorderSuggestion(BaseModel):
    suggested_quantity_packs: int
    suggested_quantity_units: int
    reorder_point_packs: int
    safety_stock_packs: int
    lead_time_demand_packs: int
    lead_time_days: Optional[int] = None
    lead_time_source: Optional[str] = None  # 'product' | 'client_config' | 'default'

class ConfidenceInterval(BaseModel):
    earliest: str  # ISO datetime
    latest: str    # ISO datetime

class StockoutPrediction(BaseModel):
    predicted_date: Optional[str]  # ISO datetime
    days_until_stockout: Optional[int]
    confidence_score: float
    confidence_interval: Optional[ConfidenceInterval]


class FinancialMetrics(BaseModel):
    inventory_value: Optional[float] = None
    daily_holding_cost: Optional[float] = None
    monthly_holding_cost: Optional[float] = None
    annual_holding_cost: Optional[float] = None
    reorder_cost: Optional[float] = None
    stockout_risk_cost: Optional[float] = None
    total_inventory_investment: Optional[float] = None

class UsageCalculationResponse(BaseModel):
    product_id: str
    product_name: str
    monthly_usage_units: float
    monthly_usage_packs: float
    weeks_remaining: Optional[float]
    stock_status: str  # 'critical' | 'low' | 'watch' | 'healthy' | 'unknown'
    calculation_method: str  # 'snapshot_delta' | 'order_sum' | 'hybrid' | 'estimated'
    confidence_score: float
    confidence_level: str  # 'high' | 'medium' | 'low'
    data_months: int
    calculation_tier: str  # '12_month' | '6_month' | '3_month' | 'weekly'
    trend: str  # 'increasing' | 'stable' | 'decreasing' | 'unknown'
    seasonality_detected: bool
    outliers_detected: int
    predicted_stockout: Optional[StockoutPrediction]
    reorder_suggestion: Optional[ReorderSuggestion]
    financial_metrics: Optional[FinancialMetrics] = None
    validation_messages: List[ValidationMessage]
    calculated_at: str  # ISO datetime

class BatchCalculationResponse(BaseModel):
    client_id: str
    products_calculated: int
    products_failed: int
    results: List[UsageCalculationResponse]
    errors: List[Dict[str, str]]

class ClientRecalculationStatus(BaseModel):
    client_id: str
    status: str  # 'started' | 'completed' | 'failed'
    message: str
    task_id: Optional[str]

class HealthCheckResponse(BaseModel):
    status: str
    database_connected: bool
    version: str
    timestamp: str

class StatsResponse(BaseModel):
    total_products: int
    products_with_usage: int
    products_needing_calculation: int
    avg_confidence_score: float
    high_confidence_count: int
    medium_confidence_count: int
    low_confidence_count: int
    calculation_methods: Dict[str, int]
