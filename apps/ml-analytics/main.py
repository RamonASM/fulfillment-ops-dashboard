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

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ML Analytics Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    """Health check endpoint"""
    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "service": "ml-analytics",
            "database": "connected"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "ml-analytics",
            "database": "disconnected",
            "error": str(e)
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
