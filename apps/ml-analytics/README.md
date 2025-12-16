# ML Analytics Service

Machine learning service for demand forecasting and predictive analytics.

## Features

- **Demand Forecasting**: Time series forecasting using Facebook Prophet
- **Stockout Prediction**: Predict when products will run out of stock
- **Seasonality Detection**: Automatic detection of weekly and yearly patterns

## Setup

### Local Development

1. Create virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set environment variables:

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
```

4. Run the service:

```bash
python main.py
```

The service will be available at `http://localhost:8000`

### Docker

Build and run with Docker:

```bash
docker build -t ml-analytics .
docker run -p 8000:8000 --env-file .env ml-analytics
```

## API Endpoints

### Health Check

```
GET /health
```

### Demand Forecast

```
POST /forecast/demand
Content-Type: application/json

{
  "product_id": "uuid",
  "horizon_days": 30
}
```

### Stockout Prediction

```
POST /predict/stockout
Content-Type: application/json

{
  "product_id": "uuid",
  "current_stock": 1000,
  "horizon_days": 90
}
```

## Model Details

### Prophet Configuration

- **Weekly Seasonality**: Enabled to capture weekly ordering patterns
- **Yearly Seasonality**: Enabled when >= 365 days of data available
- **Changepoint Prior Scale**: 0.05 (conservative trend flexibility)
- **Seasonality Prior Scale**: 10.0 (moderate seasonality strength)

### Metrics

- **MAPE**: Mean Absolute Percentage Error (lower is better)
- **RMSE**: Root Mean Squared Error

## Requirements

- Python 3.11+
- PostgreSQL database with transaction history
- Minimum 30 days of historical data per product for forecasting
