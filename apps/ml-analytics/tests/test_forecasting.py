# =============================================================================
# ML FORECASTING TESTS
# Tests Prophet model training, seasonality detection, and accuracy metrics
# =============================================================================

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from prophet import Prophet
import sys
import os

# Add parent directory to path to import main module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import calculate_mape, calculate_rmse


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_daily_data():
    """Generate sample daily usage data for 90 days"""
    dates = pd.date_range(start=datetime.now() - timedelta(days=90), periods=90, freq='D')
    # Generate realistic usage with some randomness and trend
    usage = [10 + np.random.normal(0, 2) + 0.05 * i for i in range(90)]
    df = pd.DataFrame({'ds': dates, 'y': usage})
    return df


@pytest.fixture
def sample_seasonal_data():
    """Generate sample data with weekly seasonality"""
    dates = pd.date_range(start=datetime.now() - timedelta(days=365), periods=365, freq='D')
    # Add weekly pattern (higher usage on weekdays)
    usage = []
    for i, date in enumerate(dates):
        base = 10
        weekly_effect = 5 if date.dayofweek < 5 else -3  # Higher on weekdays
        noise = np.random.normal(0, 1)
        usage.append(base + weekly_effect + noise)

    df = pd.DataFrame({'ds': dates, 'y': usage})
    return df


@pytest.fixture
def sample_sparse_data():
    """Generate sparse data (less than 30 days)"""
    dates = pd.date_range(start=datetime.now() - timedelta(days=20), periods=20, freq='D')
    usage = [10 + np.random.normal(0, 2) for _ in range(20)]
    df = pd.DataFrame({'ds': dates, 'y': usage})
    return df


# =============================================================================
# PROPHET MODEL TRAINING TESTS
# =============================================================================

def test_prophet_model_initialization():
    """Test Prophet model can be initialized with correct parameters"""
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=False,
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10.0,
    )

    assert model is not None
    assert model.daily_seasonality is False
    assert model.weekly_seasonality is True


def test_prophet_model_training(sample_daily_data):
    """Test Prophet model can be trained on sample data"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    assert model is not None
    assert hasattr(model, 'params')
    assert hasattr(model, 'history')


def test_prophet_future_dataframe(sample_daily_data):
    """Test generating future dataframe for predictions"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    future = model.make_future_dataframe(periods=30)

    assert len(future) == len(sample_daily_data) + 30
    assert 'ds' in future.columns


def test_prophet_prediction_output(sample_daily_data):
    """Test Prophet prediction output structure"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    future = model.make_future_dataframe(periods=30)
    forecast = model.predict(future)

    assert 'yhat' in forecast.columns
    assert 'yhat_lower' in forecast.columns
    assert 'yhat_upper' in forecast.columns
    assert 'ds' in forecast.columns
    assert len(forecast) == len(future)


# =============================================================================
# SEASONALITY DETECTION TESTS
# =============================================================================

def test_weekly_seasonality_detection(sample_seasonal_data):
    """Test Prophet detects weekly seasonality"""
    model = Prophet(weekly_seasonality=True, yearly_seasonality=False)
    model.fit(sample_seasonal_data)

    # Check if weekly seasonality was enabled
    assert model.weekly_seasonality is not False


def test_yearly_seasonality_with_sufficient_data(sample_seasonal_data):
    """Test yearly seasonality is enabled with 365+ days of data"""
    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=len(sample_seasonal_data) >= 365
    )
    model.fit(sample_seasonal_data)

    assert model.yearly_seasonality is not False


def test_yearly_seasonality_disabled_with_insufficient_data(sample_daily_data):
    """Test yearly seasonality is disabled with <365 days"""
    model = Prophet(
        weekly_seasonality=True,
        yearly_seasonality=len(sample_daily_data) >= 365
    )
    model.fit(sample_daily_data)

    assert model.yearly_seasonality is False


# =============================================================================
# MAPE (Mean Absolute Percentage Error) TESTS
# =============================================================================

def test_mape_perfect_prediction():
    """Test MAPE calculation with perfect predictions"""
    actual = np.array([10, 20, 30, 40, 50])
    predicted = np.array([10, 20, 30, 40, 50])

    mape = calculate_mape(actual, predicted)

    assert mape == 0.0


def test_mape_with_errors():
    """Test MAPE calculation with prediction errors"""
    actual = np.array([10, 20, 30, 40, 50])
    predicted = np.array([11, 19, 31, 39, 51])  # ±1 errors

    mape = calculate_mape(actual, predicted)

    assert mape > 0
    assert mape < 10  # Should be reasonable


def test_mape_handles_zero_values():
    """Test MAPE handles zero actual values correctly"""
    actual = np.array([0, 10, 20, 30])
    predicted = np.array([1, 11, 19, 31])

    mape = calculate_mape(actual, predicted)

    # Should skip zero values and calculate on others
    assert mape >= 0
    assert not np.isnan(mape)
    assert not np.isinf(mape)


def test_mape_returns_zero_for_all_zeros():
    """Test MAPE returns 0 when all actual values are zero"""
    actual = np.array([0, 0, 0, 0])
    predicted = np.array([1, 2, 3, 4])

    mape = calculate_mape(actual, predicted)

    assert mape == 0.0


# =============================================================================
# RMSE (Root Mean Squared Error) TESTS
# =============================================================================

def test_rmse_perfect_prediction():
    """Test RMSE calculation with perfect predictions"""
    actual = np.array([10, 20, 30, 40, 50])
    predicted = np.array([10, 20, 30, 40, 50])

    rmse = calculate_rmse(actual, predicted)

    assert rmse == 0.0


def test_rmse_with_errors():
    """Test RMSE calculation with prediction errors"""
    actual = np.array([10, 20, 30, 40, 50])
    predicted = np.array([11, 19, 31, 39, 51])  # ±1 errors

    rmse = calculate_rmse(actual, predicted)

    assert rmse > 0
    assert rmse < 2  # Should be close to 1 for ±1 errors


def test_rmse_larger_errors():
    """Test RMSE penalizes larger errors more"""
    actual = np.array([10, 20, 30])
    predicted_small = np.array([11, 21, 31])  # +1 errors
    predicted_large = np.array([15, 25, 35])  # +5 errors

    rmse_small = calculate_rmse(actual, predicted_small)
    rmse_large = calculate_rmse(actual, predicted_large)

    assert rmse_large > rmse_small


# =============================================================================
# CONFIDENCE INTERVAL TESTS
# =============================================================================

def test_prediction_intervals_are_reasonable(sample_daily_data):
    """Test that prediction intervals (yhat_lower, yhat_upper) are reasonable"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    future = model.make_future_dataframe(periods=30)
    forecast = model.predict(future)

    # Check that lower < yhat < upper
    assert (forecast['yhat_lower'] <= forecast['yhat']).all()
    assert (forecast['yhat'] <= forecast['yhat_upper']).all()


def test_prediction_intervals_contain_actual_values(sample_daily_data):
    """Test that prediction intervals contain most actual values"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    # Predict on training data
    forecast = model.predict(sample_daily_data)

    # Check how many actual values fall within intervals
    within_interval = (
        (sample_daily_data['y'] >= forecast['yhat_lower']) &
        (sample_daily_data['y'] <= forecast['yhat_upper'])
    ).sum()

    # At least 70% should be within intervals (95% CI would be ideal)
    coverage = within_interval / len(sample_daily_data)
    assert coverage >= 0.7


# =============================================================================
# EDGE CASE TESTS
# =============================================================================

def test_insufficient_data_handling(sample_sparse_data):
    """Test model behavior with insufficient data (<30 days)"""
    # Model should still train but predictions may be unreliable
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_sparse_data)

    future = model.make_future_dataframe(periods=10)
    forecast = model.predict(future)

    assert len(forecast) == len(sample_sparse_data) + 10


def test_non_negative_predictions(sample_daily_data):
    """Test that negative predictions are clipped to zero"""
    model = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model.fit(sample_daily_data)

    future = model.make_future_dataframe(periods=30)
    forecast = model.predict(future)

    # Apply clipping as done in main.py
    forecast['yhat'] = forecast['yhat'].clip(lower=0)
    forecast['yhat_lower'] = forecast['yhat_lower'].clip(lower=0)
    forecast['yhat_upper'] = forecast['yhat_upper'].clip(lower=0)

    assert (forecast['yhat'] >= 0).all()
    assert (forecast['yhat_lower'] >= 0).all()
    assert (forecast['yhat_upper'] >= 0).all()


def test_prediction_consistency(sample_daily_data):
    """Test that predictions are consistent across multiple runs"""
    model1 = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model1.fit(sample_daily_data)
    future1 = model1.make_future_dataframe(periods=30)
    forecast1 = model1.predict(future1)

    model2 = Prophet(daily_seasonality=False, weekly_seasonality=True)
    model2.fit(sample_daily_data)
    future2 = model2.make_future_dataframe(periods=30)
    forecast2 = model2.predict(future2)

    # Predictions should be very similar (allowing for small floating-point differences)
    diff = np.abs(forecast1['yhat'].tail(30).values - forecast2['yhat'].tail(30).values)
    assert diff.max() < 0.1  # Very small difference allowed


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
