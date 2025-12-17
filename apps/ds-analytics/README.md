# DS Analytics Service

Advanced data science service for inventory intelligence, usage calculation, and predictive analytics.

## Overview

This Python-based microservice provides sophisticated usage calculation using multiple data sources, confidence scoring, trend analysis, and stockout predictions. It integrates with the Node.js backend to populate dashboard metrics that were previously empty due to missing monthly usage data.

## Features

### Multi-Method Usage Calculation

- **Order Fulfillment Analysis**: Calculate usage from completed transactions
- **Snapshot Delta Method**: Infer consumption from stock level changes over time
- **Hybrid Approach**: Combine multiple methods with weighted averaging
- **Statistical Estimation**: Fallback calculation using notification points

### Intelligence & Predictions

- **Confidence Scoring**: 0-1 score based on data quality, recency, and consistency
- **Trend Detection**: Identify increasing/stable/decreasing usage patterns
- **Seasonality Analysis**: Detect annual, quarterly, and seasonal patterns
- **Stockout Prediction**: Predict when products will run out with confidence intervals
- **Reorder Suggestions**: Calculate optimal reorder quantities

### Data Quality

- **Outlier Detection**: Identify and flag anomalous usage months
- **Validation Rules**: 10+ validation checks for data accuracy
- **Cross-Validation**: Correlate multiple data sources for accuracy
- **Confidence Levels**: High/Medium/Low categorization

## Architecture

```
┌─────────────────────────────────────────┐
│ Node.js API (apps/api)                  │
│ ├─ import.service.ts                    │
│ ├─ ds-analytics.service.ts (new)        │
│ └─ scheduler.ts                         │
└────────────┬────────────────────────────┘
             │ HTTP REST calls
┌────────────▼────────────────────────────┐
│ Python DS Analytics (apps/ds-analytics) │
│ ├─ main.py (FastAPI)                    │
│ ├─ services/                            │
│ │   ├─ usage_calculator.py              │
│ │   └─ data_validator.py                │
│ ├─ utils/                               │
│ │   ├─ statistical.py                   │
│ │   └─ confidence.py                    │
│ └─ models/                              │
│     ├─ database.py (SQLAlchemy)         │
│     └─ schemas.py (Pydantic)            │
└─────────────┬───────────────────────────┘
              │
              ▼
      PostgreSQL Database
```

## Installation

### Local Development

1. **Create virtual environment:**

```bash
cd apps/ds-analytics
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies:**

```bash
pip install -r requirements.txt
```

3. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your database URL
```

4. **Run the service:**

```bash
python main.py
# Or with uvicorn directly:
uvicorn main:app --reload --port 8000
```

### Docker Deployment

1. **Build the image:**

```bash
docker build -t ds-analytics:latest apps/ds-analytics/
```

2. **Run with docker-compose:**

```bash
docker-compose -f docker-compose.dev.yml up ds-analytics
```

### Production Deployment

See `../../deploy/DEPLOYMENT-COMPREHENSIVE.md` for full production setup.

## API Endpoints

### Health Check

```
GET /health
```

Returns service health and database connectivity status.

### Calculate Usage (Batch)

```
POST /calculate-usage
Content-Type: application/json

{
  "product_ids": ["prod-123", "prod-456"],
  "client_id": "client-789",
  "force_recalculate": false
}
```

Returns usage calculations with confidence scores, trends, predictions, and reorder suggestions.

### Recalculate Client

```
POST /calculate-usage/client/{client_id}
```

Triggers background recalculation for all client products.

### Statistics

```
GET /stats
```

Returns service statistics including coverage, confidence distribution, and calculation methods.

## Integration with Node.js Backend

### Automatic Calculation After Import

The DS Analytics service is automatically called after CSV imports:

**File:** `apps/api/src/services/import.service.ts`

```typescript
import { calculateUsageAfterImport } from "./ds-analytics.service.js";

// After import completes:
await calculateUsageAfterImport(importedProductIds, clientId);
```

### Daily Scheduled Recalculation

**File:** `apps/api/src/jobs/scheduler.ts`

```typescript
import { recalculateAllClientsUsage } from "../services/ds-analytics.service.js";

// Runs daily:
registerJob("daily-usage-recalculation", 24 * 60 * 60 * 1000, async () => {
  await recalculateAllClientsUsage();
});
```

## Database Schema

### New Fields Added to `products` Table

```sql
-- Usage intelligence
usage_data_months          INTEGER        -- Number of months of data used
usage_calculation_tier     TEXT           -- '12_month' | '6_month' | '3_month' | 'weekly'
usage_calculation_method   TEXT           -- 'snapshot_delta' | 'order_fulfillment' | 'hybrid' | 'estimated'
usage_trend                TEXT           -- 'increasing' | 'stable' | 'decreasing'
seasonality_detected       BOOLEAN        -- Whether seasonal pattern detected

-- Predictions
projected_stockout_date    TIMESTAMP      -- When product will run out
stockout_confidence        DOUBLE PRECISION -- Confidence in prediction
suggested_reorder_qty      INTEGER        -- Recommended reorder amount
reorder_qty_last_updated   TIMESTAMP      -- When suggestion was calculated
```

### New Table: `monthly_usage_snapshots`

Stores historical monthly usage for trend analysis and seasonality detection.

```sql
CREATE TABLE monthly_usage_snapshots (
  id                  TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL,
  year_month          TEXT NOT NULL,  -- '2024-12'
  consumed_units      INTEGER,
  consumed_packs      DOUBLE PRECISION,
  transaction_count   INTEGER,
  order_count         INTEGER,
  calculation_method  TEXT,
  confidence          DOUBLE PRECISION,
  is_outlier          BOOLEAN,
  created_at          TIMESTAMP,

  UNIQUE(product_id, year_month)
);
```

## Calculation Methods Explained

### 1. Order Fulfillment Method

**Data Source:** `transactions` table
**Logic:** Sum completed transactions per month, calculate weighted average
**Confidence:** High when 12+ months of data, medium for 6+, low for <3

```python
# Weighted average (recent months weighted 1.5x)
monthly_usage = weighted_average(monthly_sums, weights=time_weights)
```

### 2. Snapshot Delta Method

**Data Source:** `stock_history` table
**Logic:** Compare inventory levels over time to infer consumption

```python
# For each snapshot pair:
consumption = previous_stock - current_stock
daily_rate = consumption / days_between
monthly_usage = daily_rate * 30.44
```

### 3. Hybrid Method

**Logic:** Combine order and snapshot methods using confidence-weighted average

```python
hybrid_usage = (
  order_usage * order_confidence +
  snapshot_usage * snapshot_confidence
) / (order_confidence + snapshot_confidence)
```

### 4. Statistical Estimation

**Data Source:** `notification_point` field
**Logic:** Reverse-engineer usage from reorder threshold

```python
# Notification point typically = lead time + safety stock
weeks_of_usage = (lead_time_days + safety_stock_days) / 7
weekly_usage = notification_point / weeks_of_usage
monthly_usage = weekly_usage * 4.33
```

## Formulas

### Weeks Remaining

```python
weeks_remaining = (current_stock / monthly_usage) * 4.33
```

### Stock Status Classification

- **Critical**: ≤2 weeks
- **Low**: 2-4 weeks
- **Watch**: 4-8 weeks
- **Healthy**: >8 weeks

### Stockout Prediction

```python
days_until_stockout = current_stock / daily_usage_rate

# With confidence interval:
margin = 1.96 * (std_dev / daily_usage) * sqrt(days)
earliest = predicted_date - timedelta(days=margin)
latest = predicted_date + timedelta(days=margin)
```

### Reorder Quantity

```python
reorder_point = (daily_usage * lead_time_days) + safety_stock
suggested_qty = max(0, reorder_point - current_stock)
```

## Testing

### Run Unit Tests

```bash
pytest tests/
```

### Test with Everstory Data

1. **Import Everstory CSV**

```bash
# Upload via API or UI
POST /api/import
```

2. **Trigger calculation manually**

```bash
curl -X POST http://localhost:8000/calculate-usage \
  -H "Content-Type: application/json" \
  -d '{
    "product_ids": ["evr-prod-001"],
    "client_id": "everstory-id"
  }'
```

3. **Check results**

```bash
curl http://localhost:8000/stats
```

## Monitoring

### Prometheus Metrics

The service exposes metrics at `/metrics`:

- `usage_calculations_total` - Counter of calculations by method and confidence
- `usage_calculation_duration_seconds` - Histogram of calculation time
- `usage_calculations_in_progress` - Gauge of active calculations

### Logs

Structured JSON logging using `structlog`:

```json
{
  "event": "usage_calculated",
  "product_id": "prod-123",
  "method": "hybrid",
  "confidence": 0.85,
  "timestamp": "2025-12-16T10:30:00Z"
}
```

## Troubleshooting

### Service Not Starting

```bash
# Check database connectivity
psql postgresql://postgres:postgres@localhost:5432/inventory_db -c "SELECT 1"

# Check port availability
lsof -i :8000
```

### No Usage Data Calculated

**Possible causes:**

1. No transaction history exists
2. Stock history snapshots not running (check scheduler)
3. Product is too new (< 1 month of data)

**Solution:**

- Ensure `stock-history-snapshot` job is running every 6 hours
- Wait for more data to accumulate
- Check validation messages in response

### Low Confidence Scores

**Causes:**

- Limited data points (< 3 months)
- High variability in usage
- Old data (> 90 days since last transaction)

**Solution:**

- More data will improve confidence over time
- Review product for seasonality or irregular ordering

## Performance

**Benchmarks:**

- Single product calculation: ~50-100ms
- Batch of 100 products: ~5-8 seconds
- Full client recalculation (500 products): ~30-45 seconds

**Optimization:**

- Uses database connection pooling
- Batch operations for multiple products
- Caching (future enhancement with Redis)

## Future Enhancements

1. **Machine Learning Models**: Train product-specific forecasting models
2. **Real-time Calculation**: Stream processing with Kafka
3. **Multi-warehouse Support**: Location-specific usage rates
4. **Demand Shaping**: Identify promotional impact
5. **ABC Analysis Integration**: Prioritize high-value products

## Contributing

When adding new calculation methods:

1. Add method to `UsageCalculator` class
2. Update confidence scoring in `ConfidenceCalculator`
3. Add validation rules in `DataValidator`
4. Write unit tests in `tests/`
5. Update this README

## License

Proprietary - Inventory IQ Platform

## Support

For issues or questions:

- Check logs: `docker logs inventory-ds-analytics`
- Review validation messages in API responses
- Contact: support@inventoryiq.com
