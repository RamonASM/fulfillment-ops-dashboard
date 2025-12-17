# =============================================================================
# ML API TESTS
# Tests FastAPI endpoints, request validation, and database integration
# =============================================================================

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta
import pandas as pd
import sys
import os

# Add parent directory to path to import main module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app, ForecastRequest, StockoutPredictionRequest


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def client():
    """FastAPI test client"""
    return TestClient(app)


@pytest.fixture
def mock_db_connection():
    """Mock database connection"""
    with patch('main.engine') as mock_engine:
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        yield mock_conn


@pytest.fixture
def sample_transaction_data():
    """Sample transaction data for mocking database queries"""
    dates = pd.date_range(start=datetime.now() - timedelta(days=90), periods=90, freq='D')
    data = [(date, 10 + (i % 10)) for i, date in enumerate(dates)]
    return data


# =============================================================================
# HEALTH CHECK ENDPOINT TESTS
# =============================================================================

def test_health_check_success(client, mock_db_connection):
    """Test health check endpoint returns healthy status"""
    # Mock successful database query
    mock_db_connection.execute.return_value = None

    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ml-analytics"
    assert data["database"] == "connected"


def test_health_check_database_failure(client, mock_db_connection):
    """Test health check handles database connection failures"""
    # Mock database connection failure
    mock_db_connection.execute.side_effect = Exception("Connection failed")

    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "unhealthy"
    assert data["database"] == "disconnected"
    assert "error" in data


# =============================================================================
# DEMAND FORECAST ENDPOINT TESTS
# =============================================================================

def test_forecast_demand_success(client, mock_db_connection, sample_transaction_data):
    """Test successful demand forecast generation"""
    # Mock database query result
    mock_result = Mock()
    mock_result.fetchall.return_value = sample_transaction_data
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "test-product-123",
        "horizon_days": 30
    }

    response = client.post("/forecast/demand", json=request_data)

    assert response.status_code == 200
    data = response.json()
    assert data["product_id"] == "test-product-123"
    assert "predictions" in data
    assert "model_metrics" in data
    assert "seasonality_detected" in data
    assert len(data["predictions"]) == 30


def test_forecast_demand_no_data(client, mock_db_connection):
    """Test forecast endpoint handles no transaction data"""
    # Mock empty database result
    mock_result = Mock()
    mock_result.fetchall.return_value = []
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "nonexistent-product",
        "horizon_days": 30
    }

    response = client.post("/forecast/demand", json=request_data)

    assert response.status_code == 404
    assert "No transaction data found" in response.json()["detail"]


def test_forecast_demand_insufficient_data(client, mock_db_connection):
    """Test forecast endpoint handles insufficient data (<30 days)"""
    # Mock insufficient data (only 20 days)
    dates = pd.date_range(start=datetime.now() - timedelta(days=20), periods=20, freq='D')
    insufficient_data = [(date, 10) for date in dates]

    mock_result = Mock()
    mock_result.fetchall.return_value = insufficient_data
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "test-product-456",
        "horizon_days": 30
    }

    response = client.post("/forecast/demand", json=request_data)

    assert response.status_code == 400
    assert "Insufficient data" in response.json()["detail"]


def test_forecast_demand_validation(client):
    """Test forecast request validation"""
    # Missing product_id
    response = client.post("/forecast/demand", json={"horizon_days": 30})
    assert response.status_code == 422  # Validation error

    # Invalid horizon_days type
    response = client.post("/forecast/demand", json={
        "product_id": "test",
        "horizon_days": "not-a-number"
    })
    assert response.status_code == 422


# =============================================================================
# STOCKOUT PREDICTION ENDPOINT TESTS
# =============================================================================

def test_stockout_prediction_success(client, mock_db_connection, sample_transaction_data):
    """Test successful stockout prediction"""
    # Mock database query result
    mock_result = Mock()
    mock_result.fetchall.return_value = sample_transaction_data
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "test-product-123",
        "current_stock": 500,
        "horizon_days": 90
    }

    response = client.post("/predict/stockout", json=request_data)

    assert response.status_code == 200
    data = response.json()
    assert data["product_id"] == "test-product-123"
    assert "predicted_stockout_date" in data
    assert "days_until_stockout" in data
    assert "confidence" in data
    assert "daily_usage_forecast" in data
    assert 0 <= data["confidence"] <= 1


def test_stockout_prediction_no_stockout(client, mock_db_connection, sample_transaction_data):
    """Test stockout prediction with very high stock (no stockout expected)"""
    # Mock database query result
    mock_result = Mock()
    mock_result.fetchall.return_value = sample_transaction_data
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "test-product-123",
        "current_stock": 10000,  # Very high stock
        "horizon_days": 90
    }

    response = client.post("/predict/stockout", json=request_data)

    assert response.status_code == 200
    data = response.json()
    # Might not predict stockout within horizon
    assert "predicted_stockout_date" in data
    assert "days_until_stockout" in data


def test_stockout_prediction_validation(client):
    """Test stockout request validation"""
    # Missing required fields
    response = client.post("/predict/stockout", json={"product_id": "test"})
    assert response.status_code == 422

    # Invalid current_stock type
    response = client.post("/predict/stockout", json={
        "product_id": "test",
        "current_stock": "not-a-number",
        "horizon_days": 90
    })
    assert response.status_code == 422


# =============================================================================
# PERFORMANCE TESTS
# =============================================================================

def test_forecast_response_time(client, mock_db_connection, sample_transaction_data):
    """Test forecast endpoint responds within reasonable time"""
    import time

    # Mock database query result
    mock_result = Mock()
    mock_result.fetchall.return_value = sample_transaction_data
    mock_db_connection.execute.return_value = mock_result

    request_data = {
        "product_id": "test-product-123",
        "horizon_days": 30
    }

    start_time = time.time()
    response = client.post("/forecast/demand", json=request_data)
    duration = time.time() - start_time

    assert response.status_code == 200
    assert duration < 5  # Should complete within 5 seconds


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
