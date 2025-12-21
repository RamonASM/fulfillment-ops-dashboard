# =============================================================================
# ML ANALYTICS SERVICE
# Demand forecasting and predictive analytics using machine learning
# =============================================================================

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import numpy as np
from prophet import Prophet
from datetime import datetime, timedelta
import os
from sqlalchemy import create_engine, text
import logging
from dotenv import load_dotenv
from threading import Lock

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# =============================================================================
# CIRCUIT BREAKER PATTERN
# =============================================================================

class CircuitBreaker:
    """
    Simple circuit breaker to prevent cascading failures.

    States:
    - CLOSED: Normal operation, requests flow through
    - OPEN: Too many failures, requests are rejected immediately
    - HALF_OPEN: Testing if service recovered, allow one request through

    After FAILURE_THRESHOLD consecutive failures, circuit opens.
    After RECOVERY_TIMEOUT seconds, circuit becomes half-open.
    If half-open request succeeds, circuit closes.
    """

    FAILURE_THRESHOLD = 5  # Consecutive failures before opening
    RECOVERY_TIMEOUT = 60  # Seconds before attempting recovery

    def __init__(self, name: str):
        self.name = name
        self.failure_count = 0
        self.last_failure_time: datetime | None = None
        self.state = "CLOSED"
        self._lock = Lock()

    def record_success(self):
        """Record a successful operation, reset failure count."""
        with self._lock:
            self.failure_count = 0
            self.state = "CLOSED"

    def record_failure(self):
        """Record a failed operation, potentially open circuit."""
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now()

            if self.failure_count >= self.FAILURE_THRESHOLD:
                self.state = "OPEN"
                logger.warning(
                    f"Circuit breaker '{self.name}' OPENED after {self.failure_count} failures"
                )

    def can_execute(self) -> bool:
        """Check if request should be allowed through."""
        with self._lock:
            if self.state == "CLOSED":
                return True

            if self.state == "OPEN":
                # Check if recovery timeout has elapsed
                if self.last_failure_time:
                    elapsed = (datetime.now() - self.last_failure_time).total_seconds()
                    if elapsed >= self.RECOVERY_TIMEOUT:
                        self.state = "HALF_OPEN"
                        logger.info(f"Circuit breaker '{self.name}' now HALF_OPEN")
                        return True
                return False

            # HALF_OPEN: allow one request through to test
            return True

    def get_status(self) -> dict:
        """Get current circuit breaker status."""
        with self._lock:
            return {
                "name": self.name,
                "state": self.state,
                "failure_count": self.failure_count,
                "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None
            }


# Global circuit breaker for database operations
db_circuit_breaker = CircuitBreaker("database")

app = FastAPI(title="ML Analytics Service", version="1.0.0")

# CORS middleware - Use environment-based configuration for security
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").split(",") if os.getenv("ALLOWED_ORIGINS") else [
    "https://admin.yourtechassist.us",
    "https://portal.yourtechassist.us",
    "https://api.yourtechassist.us",
]

# In development, allow localhost
if os.getenv("ENVIRONMENT", "production") == "development":
    ALLOWED_ORIGINS.extend([
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

engine = create_engine(DATABASE_URL)

# =============================================================================
# MODELS
# =============================================================================

class ForecastRequest(BaseModel):
    product_id: str
    horizon_days: int = 30

class ForecastResponse(BaseModel):
    product_id: str
    predictions: List[dict]
    model_metrics: dict
    seasonality_detected: bool

class StockoutPredictionRequest(BaseModel):
    product_id: str
    current_stock: int
    horizon_days: int = 90

class StockoutPredictionResponse(BaseModel):
    product_id: str
    predicted_stockout_date: Optional[str]
    days_until_stockout: Optional[int]
    confidence: float
    daily_usage_forecast: List[dict]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def calculate_mape(actual, predicted):
    """Mean Absolute Percentage Error"""
    # Avoid division by zero
    mask = actual != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)

def calculate_rmse(actual, predicted):
    """Root Mean Squared Error"""
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))

# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint with circuit breaker status"""
    db_connected = False
    db_latency_ms = None

    try:
        # Test database connection with timing
        import time
        start = time.time()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_latency_ms = round((time.time() - start) * 1000, 2)
        db_connected = True
        db_circuit_breaker.record_success()
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        db_circuit_breaker.record_failure()

    # Get circuit breaker status
    circuit_status = db_circuit_breaker.get_status()

    # Determine overall health
    # Unhealthy if: DB disconnected OR circuit is OPEN
    is_healthy = db_connected and circuit_status["state"] != "OPEN"

    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "service": "ml-analytics",
        "database": "connected" if db_connected else "disconnected",
        "db_latency_ms": db_latency_ms,
        "circuit_breaker": circuit_status,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/forecast/demand", response_model=ForecastResponse)
async def forecast_demand(request: ForecastRequest):
    """
    Generate demand forecast using Facebook Prophet

    Args:
        request: ForecastRequest with product_id and horizon_days

    Returns:
        ForecastResponse with predictions and metrics
    """
    # Check circuit breaker before processing
    if not db_circuit_breaker.can_execute():
        raise HTTPException(
            status_code=503,
            detail="Service temporarily unavailable due to database issues. Please try again later."
        )

    try:
        logger.info(f"Forecasting demand for product {request.product_id}")

        # Fetch historical transaction data
        query = text("""
            SELECT date_submitted as ds, SUM(quantity_units) as y
            FROM transactions
            WHERE product_id = :product_id
              AND date_submitted >= NOW() - INTERVAL '12 months'
              AND order_status = 'completed'
            GROUP BY date_submitted
            ORDER BY date_submitted
        """)

        with engine.connect() as conn:
            result = conn.execute(query, {"product_id": request.product_id})
            rows = result.fetchall()

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"No transaction data found for product {request.product_id}"
            )

        # Convert to DataFrame
        df = pd.DataFrame(rows, columns=['ds', 'y'])
        df['ds'] = pd.to_datetime(df['ds'])

        if len(df) < 30:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data for forecasting (found {len(df)} days, minimum 30 required)"
            )

        # Data quality verification before training
        nan_count = df['y'].isna().sum()
        nan_percentage = (nan_count / len(df)) * 100
        if nan_percentage > 20:
            raise HTTPException(
                status_code=400,
                detail=f"Data quality too low: {nan_percentage:.1f}% of values are NaN (max 20% allowed)"
            )

        # Check for zero variance (all same values)
        if df['y'].std() == 0:
            raise HTTPException(
                status_code=400,
                detail="Data has zero variance - all values are identical, cannot forecast"
            )

        # Check for extreme outliers (values > 10x mean)
        mean_val = df['y'].mean()
        if mean_val > 0:
            outlier_count = (df['y'] > mean_val * 10).sum()
            outlier_percentage = (outlier_count / len(df)) * 100
            if outlier_percentage > 5:
                logger.warning(
                    f"High outlier percentage ({outlier_percentage:.1f}%) detected - "
                    f"forecast accuracy may be reduced"
                )

        # Log data quality metrics
        logger.info(f"Data quality check passed: {len(df)} points, "
                   f"mean={mean_val:.2f}, std={df['y'].std():.2f}, "
                   f"nan={nan_percentage:.1f}%")

        # Train Prophet model
        logger.info(f"Training Prophet model on {len(df)} data points")
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=len(df) >= 365,
            changepoint_prior_scale=0.05,  # Flexibility of trend changes
            seasonality_prior_scale=10.0,   # Strength of seasonality
        )

        # Fit the model
        model.fit(df)

        # Generate forecast
        future = model.make_future_dataframe(periods=request.horizon_days)
        forecast = model.predict(future)

        # Extract future predictions only
        predictions = forecast.tail(request.horizon_days)[
            ['ds', 'yhat', 'yhat_lower', 'yhat_upper']
        ].copy()

        # Track negative predictions before clipping (indicates model uncertainty)
        negative_yhat_count = (predictions['yhat'] < 0).sum()
        negative_lower_count = (predictions['yhat_lower'] < 0).sum()

        if negative_yhat_count > 0 or negative_lower_count > 0:
            logger.warning(
                f"Negative predictions detected and clipped to 0: "
                f"yhat={negative_yhat_count}, yhat_lower={negative_lower_count} of {len(predictions)} predictions. "
                f"This may indicate high model uncertainty or poor data quality."
            )

        # Ensure non-negative predictions (demand cannot be negative)
        predictions['yhat'] = predictions['yhat'].clip(lower=0)
        predictions['yhat_lower'] = predictions['yhat_lower'].clip(lower=0)
        predictions['yhat_upper'] = predictions['yhat_upper'].clip(lower=0)

        # Convert to dict
        predictions_list = predictions.to_dict('records')
        for pred in predictions_list:
            pred['ds'] = pred['ds'].isoformat()
            pred['yhat'] = float(pred['yhat'])
            pred['yhat_lower'] = float(pred['yhat_lower'])
            pred['yhat_upper'] = float(pred['yhat_upper'])

        # Calculate accuracy metrics on historical data
        historical_pred = model.predict(df)
        mape = calculate_mape(df['y'].values, historical_pred['yhat'].values)
        rmse = calculate_rmse(df['y'].values, historical_pred['yhat'].values)

        # Detect seasonality
        seasonality_detected = (
            model.yearly_seasonality or
            model.weekly_seasonality or
            model.daily_seasonality
        )

        logger.info(f"Forecast complete. MAPE: {mape:.2f}%, RMSE: {rmse:.2f}")

        # Record success with circuit breaker
        db_circuit_breaker.record_success()

        return ForecastResponse(
            product_id=request.product_id,
            predictions=predictions_list,
            model_metrics={
                "mape": round(mape, 2),
                "rmse": round(rmse, 2),
                "training_samples": len(df),
            },
            seasonality_detected=seasonality_detected
        )

    except HTTPException:
        raise
    except Exception as e:
        # Record failure with circuit breaker
        db_circuit_breaker.record_failure()
        logger.error(f"Forecast failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Forecasting failed: {str(e)}"
        )

@app.post("/predict/stockout", response_model=StockoutPredictionResponse)
async def predict_stockout(request: StockoutPredictionRequest):
    """
    Predict when a product will stock out based on forecast demand

    Args:
        request: StockoutPredictionRequest with product_id, current_stock, horizon_days

    Returns:
        StockoutPredictionResponse with predicted stockout date
    """
    # Check circuit breaker before processing
    if not db_circuit_breaker.can_execute():
        raise HTTPException(
            status_code=503,
            detail="Service temporarily unavailable due to database issues. Please try again later."
        )

    try:
        logger.info(f"Predicting stockout for product {request.product_id}")

        # Get demand forecast
        forecast_req = ForecastRequest(
            product_id=request.product_id,
            horizon_days=request.horizon_days
        )
        forecast_resp = await forecast_demand(forecast_req)

        # Calculate cumulative usage and find stockout date
        current_stock = request.current_stock
        predictions = forecast_resp.predictions

        daily_forecasts = []
        stockout_date = None
        days_until_stockout = None

        for i, pred in enumerate(predictions):
            daily_usage = max(0, pred['yhat'])  # Ensure non-negative
            current_stock -= daily_usage

            daily_forecasts.append({
                'date': pred['ds'],
                'predicted_usage': round(daily_usage, 2),
                'remaining_stock': round(max(0, current_stock), 2)
            })

            # Check if stockout occurs
            if current_stock <= 0 and stockout_date is None:
                stockout_date = pred['ds']
                days_until_stockout = i + 1
                break

        # Calculate confidence based on MAPE
        mape = forecast_resp.model_metrics.get('mape', 100)
        confidence = max(0, min(1, 1 - (mape / 100)))

        logger.info(f"Stockout prediction complete. Stockout in {days_until_stockout} days" if days_until_stockout else "No stockout predicted")

        return StockoutPredictionResponse(
            product_id=request.product_id,
            predicted_stockout_date=stockout_date,
            days_until_stockout=days_until_stockout,
            confidence=round(confidence, 3),
            daily_usage_forecast=daily_forecasts[:30]  # Return first 30 days
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stockout prediction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Stockout prediction failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
