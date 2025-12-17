# ML Analytics Service - Technical Setup Guide

**Production deployment and maintenance guide for developers**

This document provides technical details for deploying, configuring, and maintaining the ML Analytics service.

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Environment                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐      ┌──────────────┐               │
│  │   PostgreSQL │◄─────┤     API      │               │
│  │   Database   │      │  (Node.js)   │               │
│  └──────────────┘      └───────┬──────┘               │
│         ▲                       │                       │
│         │                       │ HTTP                  │
│         │                       ▼                       │
│         │              ┌──────────────┐                │
│         │              │  ML Analytics│                │
│         └──────────────┤   (Python)   │                │
│                        └──────────────┘                │
│                                                          │
│  ┌──────────────┐      ┌──────────────┐               │
│  │    Redis     │      │   Web/Portal │               │
│  │    Cache     │      │   (React)    │               │
│  └──────────────┘      └──────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### ML Service Responsibilities

1. **Demand Forecasting**: Generate 30-90 day predictions using Prophet
2. **Stockout Prediction**: Calculate expected stockout dates
3. **Pattern Detection**: Identify seasonality and trends
4. **Accuracy Metrics**: Calculate MAPE, RMSE, confidence scores
5. **Cache Management**: Store predictions in PostgreSQL

### Technology Stack

- **Framework**: FastAPI 0.104.1
- **ML Library**: Prophet 1.1.5 (Facebook Prophet)
- **Data Processing**: Pandas 2.1.3, NumPy 1.26.2
- **Database**: PostgreSQL (via SQLAlchemy 2.0.23, psycopg2-binary 2.9.9)
- **Server**: Uvicorn (ASGI server)
- **Container**: Docker with Python 3.11

---

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- PostgreSQL database accessible
- Node.js API service configured
- At least 30 days of transaction data

### Installation (Development)

```bash
# Clone repository
git clone <repository-url>
cd fulfillment-ops-dashboard

# Navigate to ML service
cd apps/ml-analytics

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# Run development server
python main.py

# Server starts on http://localhost:8000
```

### Quick Test

```bash
# Health check
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","service":"ml-analytics","version":"1.0.0"}
```

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file in `apps/ml-analytics/`:

```bash
# Database Connection
DATABASE_URL=postgresql://user:password@localhost:5432/inventory_db

# Server Configuration
ML_PORT=8000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info  # Options: debug, info, warning, error

# Model Parameters (Optional - defaults provided)
PROPHET_SEASONALITY_MODE=additive
PROPHET_INTERVAL_WIDTH=0.95
MIN_TRAINING_DAYS=30

# Performance
WORKER_COUNT=2  # Number of uvicorn workers
WORKER_TIMEOUT=300  # 5 minutes for long-running predictions
```

### Docker Configuration

**`apps/ml-analytics/Dockerfile`**:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD curl -f http://localhost:8000/health || exit 1

# Run server
CMD ["python", "main.py"]
```

### Docker Compose Integration

**`deploy/docker-compose.production.yml`**:

```yaml
services:
  ml-analytics:
    build:
      context: ../apps/ml-analytics
      dockerfile: Dockerfile
    container_name: ml-analytics
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - ML_PORT=8000
      - LOG_LEVEL=${LOG_LEVEL:-info}
    depends_on:
      - postgres
    networks:
      - app-network
    restart: unless-stopped
    mem_limit: 2g # Prophet can be memory-intensive
    mem_reservation: 512m
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s

networks:
  app-network:
    driver: bridge
```

---

## 📡 API Endpoints

### Health Check

**GET `/health`**

```bash
curl http://localhost:8000/health
```

**Response**:

```json
{
  "status": "healthy",
  "service": "ml-analytics",
  "version": "1.0.0",
  "timestamp": "2024-12-16T10:00:00Z"
}
```

### Demand Forecast

**POST `/forecast/demand`**

**Request Body**:

```json
{
  "product_id": "uuid-string",
  "horizon_days": 30,
  "transaction_data": [
    {
      "date": "2024-01-01",
      "quantity": 10
    },
    {
      "date": "2024-01-02",
      "quantity": 12
    }
  ]
}
```

**Response**:

```json
{
  "productId": "uuid-string",
  "predictions": [
    {
      "ds": "2024-02-01",
      "yhat": 11.5,
      "yhat_lower": 9.2,
      "yhat_upper": 13.8
    }
  ],
  "model_metrics": {
    "mape": 15.3,
    "rmse": 2.1,
    "training_samples": 90,
    "seasonality_detected": true
  },
  "generated_at": "2024-12-16T10:00:00Z",
  "horizon_days": 30
}
```

**Error Responses**:

```json
// Insufficient data
{
  "detail": "Insufficient transaction data. Need at least 30 days, got 15"
}

// Invalid input
{
  "detail": "horizon_days must be between 1 and 365"
}

// Internal error
{
  "detail": "Model training failed: <error message>"
}
```

### Stockout Prediction

**POST `/predict/stockout`**

**Request Body**:

```json
{
  "product_id": "uuid-string",
  "current_stock_units": 500,
  "horizon_days": 90,
  "transaction_data": [...]
}
```

**Response**:

```json
{
  "productId": "uuid-string",
  "predicted_stockout_date": "2024-03-15",
  "days_until_stockout": 45,
  "confidence": 0.87,
  "daily_usage_forecast": [3.2, 3.5, 3.1, 2.9, ...],
  "generated_at": "2024-12-16T10:00:00Z"
}
```

---

## 🔧 Production Deployment

### Step-by-Step Deployment

#### 1. Pre-Deployment Checklist

```bash
# Verify prerequisites
- [ ] Docker installed and running
- [ ] PostgreSQL accessible with credentials
- [ ] At least 2GB RAM available for ML service
- [ ] Network connectivity between services
- [ ] Environment variables configured
```

#### 2. Build ML Service Image

```bash
cd deploy
docker-compose -f docker-compose.production.yml build ml-analytics
```

**Expected output**:

```
[+] Building 45.2s (12/12) FINISHED
 => [internal] load build definition
 => [internal] load .dockerignore
 => [internal] load metadata for docker.io/library/python:3.11-slim
 => [1/6] FROM docker.io/library/python:3.11-slim
 => [2/6] WORKDIR /app
 => [3/6] COPY requirements.txt .
 => [4/6] RUN pip install --no-cache-dir -r requirements.txt
 => [5/6] COPY . .
 => [6/6] EXPOSE 8000
 => exporting to image
```

#### 3. Start ML Service

```bash
docker-compose -f docker-compose.production.yml up -d ml-analytics
```

#### 4. Verify Startup

```bash
# Check container status
docker ps | grep ml-analytics

# Expected:
# ml-analytics   Up 30 seconds (healthy)   0.0.0.0:8000->8000/tcp

# Check logs
docker logs ml-analytics

# Expected:
# INFO:     Started server process
# INFO:     Waiting for application startup.
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://0.0.0.0:8000
```

#### 5. Health Check

```bash
# Wait 30 seconds for initialization
sleep 30

# Test health endpoint
curl http://localhost:8000/health

# Expected:
# {"status":"healthy","service":"ml-analytics"}
```

#### 6. Integration Test

```bash
# Test with API service
curl -X POST http://localhost:3001/api/ml/health \
  -H "Authorization: Bearer <token>"

# Should return ML service status
```

### Monitoring Setup

#### Application Logs

```bash
# Real-time logs
docker logs ml-analytics --follow

# Last 100 lines
docker logs ml-analytics --tail 100

# With timestamps
docker logs ml-analytics --timestamps
```

#### Health Monitoring

**Automated Health Check Script** (`deploy/scripts/health-check.sh`):

```bash
#!/bin/bash

echo "Checking ML Analytics service health..."

response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health)

if [ "$response" == "200" ]; then
  echo "✓ ML Analytics: Healthy"
  exit 0
else
  echo "✗ ML Analytics: Unhealthy (HTTP $response)"
  exit 1
fi
```

Run health check:

```bash
bash deploy/scripts/health-check.sh
```

#### Performance Monitoring

**Key Metrics to Track**:

1. **Response Time**:

```bash
# Measure endpoint latency
time curl -X POST http://localhost:8000/forecast/demand \
  -H "Content-Type: application/json" \
  -d @sample_request.json

# Target: <30 seconds for 90-day forecast
```

2. **Memory Usage**:

```bash
docker stats ml-analytics --no-stream

# Target: <2GB RAM usage
```

3. **CPU Usage**:

```bash
docker stats ml-analytics --no-stream | grep CPU

# Target: <80% sustained
```

4. **Error Rate**:

```bash
docker logs ml-analytics | grep ERROR | wc -l

# Target: <5% error rate
```

---

## 🐛 Troubleshooting

### Common Issues

#### Issue 1: Container Won't Start

**Symptoms**:

```bash
docker ps -a | grep ml-analytics
# Status: Exited (1)
```

**Diagnosis**:

```bash
docker logs ml-analytics

# Common errors:
# - "Database connection failed"
# - "Port 8000 already in use"
# - "Module not found"
```

**Solutions**:

**Database Connection**:

```bash
# Verify DATABASE_URL is accessible
docker exec ml-analytics ping postgres -c 1

# Check environment variables
docker exec ml-analytics env | grep DATABASE_URL

# Test connection manually
docker exec -it ml-analytics python -c \
  "from sqlalchemy import create_engine; \
   import os; \
   engine = create_engine(os.getenv('DATABASE_URL')); \
   print('Connected!' if engine.connect() else 'Failed')"
```

**Port Conflict**:

```bash
# Find process using port 8000
lsof -i :8000

# Kill conflicting process
kill -9 <PID>

# Or change ML service port
# Edit docker-compose.yml: ports: - "8001:8000"
```

**Missing Dependencies**:

```bash
# Rebuild with no cache
docker-compose -f docker-compose.production.yml build \
  --no-cache ml-analytics
```

#### Issue 2: "Insufficient Data" Errors

**Symptoms**:

```json
{
  "detail": "Insufficient transaction data. Need at least 30 days, got 12"
}
```

**Diagnosis**:

```bash
# Check transaction count for product
docker exec -it postgres psql -U <user> -d inventory_db -c \
  "SELECT COUNT(*), MIN(date_submitted), MAX(date_submitted) \
   FROM transactions \
   WHERE product_id = '<product-uuid>';"
```

**Solutions**:

1. **Wait for more data**: Product is new, needs 30+ days
2. **Import historical data**: Use data import tool
3. **Check date range**: Verify transactions span 30+ days

#### Issue 3: High MAPE (>40%)

**Symptoms**: Predictions consistently inaccurate

**Diagnosis**:

```bash
# Check usage pattern regularity
docker exec -it postgres psql -U <user> -d inventory_db -c \
  "SELECT date_submitted, SUM(quantity_units) \
   FROM transactions \
   WHERE product_id = '<product-uuid>' \
   GROUP BY date_submitted \
   ORDER BY date_submitted;"

# Look for:
# - Large gaps in dates
# - Highly variable quantities
# - Outliers (10x normal usage)
```

**Solutions**:

1. **Irregular patterns**: Flag product as manual-only
2. **Outliers**: Clean data, remove one-time events
3. **Recent changes**: Allow 60 days for re-learning
4. **Insufficient data**: Need 90+ days for complex patterns

#### Issue 4: Slow Predictions (>60s)

**Symptoms**: Requests timeout or take very long

**Diagnosis**:

```bash
# Check container resources
docker stats ml-analytics

# Check database query performance
docker logs ml-analytics | grep "Query time"

# Monitor model training time
docker logs ml-analytics | grep "Training time"
```

**Solutions**:

**Increase Memory**:

```yaml
# In docker-compose.yml
mem_limit: 4g # Increase from 2g
```

**Optimize Database Queries**:

```sql
-- Add indexes for common queries
CREATE INDEX idx_transactions_product_date
  ON transactions(product_id, date_submitted);

-- Analyze query plans
EXPLAIN ANALYZE
SELECT * FROM transactions WHERE product_id = '<uuid>';
```

**Reduce Horizon**:

```python
# 30-day forecasts are faster than 90-day
horizon_days = 30  # Instead of 90
```

#### Issue 5: Memory Leaks

**Symptoms**: Container OOM (out of memory) killed

**Diagnosis**:

```bash
# Monitor memory over time
watch -n 5 'docker stats ml-analytics --no-stream'

# Check for memory warnings in logs
docker logs ml-analytics | grep -i "memory"
```

**Solutions**:

**Increase Memory Limit**:

```yaml
mem_limit: 4g # Increase allocation
```

**Enable Model Cleanup**:

```python
# In forecast code, explicitly delete models after use
import gc
# ... after prediction ...
del model
gc.collect()
```

**Restart Schedule**:

```bash
# Add restart policy
restart: unless-stopped

# Or schedule daily restarts (cron)
0 2 * * * docker restart ml-analytics
```

---

## 🔐 Security

### Authentication

The ML service itself doesn't handle authentication - it's protected by the API service.

**API Flow**:

```
Client → API (JWT validation) → ML Service (internal network)
```

**Network Security**:

- ML service only accessible via internal Docker network
- Not exposed to public internet directly
- API acts as authentication gateway

### Environment Variables

**Secure Storage**:

```bash
# Never commit .env files
echo ".env" >> .gitignore

# Use secrets management
docker secret create db_url <(echo $DATABASE_URL)

# In docker-compose:
secrets:
  - db_url
```

### Database Connection

**Use Read-Only User** (if possible):

```sql
-- Create read-only user for ML service
CREATE USER ml_readonly WITH PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ml_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ml_readonly;

-- Exception: Allow writes to mLPrediction table (for caching)
GRANT INSERT, UPDATE ON TABLE "m_l_predictions" TO ml_readonly;
```

**Connection String**:

```bash
DATABASE_URL=postgresql://ml_readonly:password@postgres:5432/inventory_db
```

---

## 📊 Performance Optimization

### Caching Strategy

**Prediction Cache**:

```python
# Predictions cached in database (mLPrediction table)
# Default TTL: 24 hours
# Reduces repeated computations

# Force refresh by passing cache_bypass flag
```

**Database Connection Pooling**:

```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30
)
```

### Model Optimization

**Prophet Parameters**:

```python
from prophet import Prophet

model = Prophet(
    # Faster training
    daily_seasonality=False,  # Disable if not needed
    weekly_seasonality='auto',
    yearly_seasonality='auto',

    # Accuracy vs speed tradeoff
    seasonality_mode='additive',  # Faster than multiplicative
    interval_width=0.95,  # 95% confidence

    # Performance
    mcmc_samples=0,  # Disable MCMC for speed
)
```

### Horizontal Scaling

**Load Balancing Multiple Instances**:

```yaml
# docker-compose.yml
services:
  ml-analytics-1:
    <<: *ml-service-config
    container_name: ml-analytics-1

  ml-analytics-2:
    <<: *ml-service-config
    container_name: ml-analytics-2

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx-ml-lb.conf:/etc/nginx/nginx.conf
    ports:
      - "8000:8000"
```

**nginx-ml-lb.conf**:

```nginx
upstream ml_backend {
    least_conn;
    server ml-analytics-1:8000;
    server ml-analytics-2:8000;
}

server {
    listen 8000;
    location / {
        proxy_pass http://ml_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```

---

## 🧪 Testing

### Unit Tests

**Run Python tests**:

```bash
cd apps/ml-analytics

# Activate venv
source venv/bin/activate

# Run tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=. --cov-report=html
```

### Integration Tests

**From Node.js test suite**:

```bash
cd apps/api
npm run test:integration -- ml-service.integration.test.ts
```

### Load Testing

**Simple Load Test**:

```bash
# Install hey (HTTP load generator)
# https://github.com/rakyll/hey

# 100 requests, 10 concurrent
hey -n 100 -c 10 -m POST \
  -H "Content-Type: application/json" \
  -D sample_request.json \
  http://localhost:8000/forecast/demand

# Target: P95 < 30s, P99 < 45s
```

---

## 📚 Additional Resources

### Dependencies

**`requirements.txt`**:

```
fastapi==0.104.1
prophet==1.1.5
pandas==2.1.3
numpy==1.26.2
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
uvicorn[standard]==0.24.0
python-dotenv==1.0.0
```

### Documentation

- **Facebook Prophet**: https://facebook.github.io/prophet/
- **FastAPI**: https://fastapi.tiangolo.com/
- **SQLAlchemy**: https://docs.sqlalchemy.org/
- **Docker**: https://docs.docker.com/

### Support

**Internal Support**:

- **Slack**: #ml-analytics-support
- **Email**: ml-team@internal.inventoryiq.com
- **On-Call**: PagerDuty rotation

**External Resources**:

- GitHub Issues (for bugs)
- Prophet Community (for ML questions)
- Stack Overflow (for general Python/FastAPI)

---

## 🔄 Maintenance

### Regular Tasks

**Weekly**:

- Monitor error logs
- Check prediction accuracy metrics
- Review slow query logs
- Verify disk space

**Monthly**:

- Update dependencies (security patches)
- Review and clean old predictions cache
- Analyze performance trends
- Update documentation

**Quarterly**:

- Major version updates
- Performance optimization review
- Capacity planning
- Disaster recovery drill

### Backup & Recovery

**Database Backups**:

```bash
# Predictions are cached in PostgreSQL
# Use existing database backup strategy

# Daily backup via cron
0 2 * * * bash /path/to/backup-db.sh
```

**Container Images**:

```bash
# Tag and push images to registry
docker tag ml-analytics:latest registry.example.com/ml-analytics:v1.0.0
docker push registry.example.com/ml-analytics:v1.0.0
```

**Configuration Backups**:

```bash
# Backup compose files and configs
tar -czf ml-service-config-$(date +%F).tar.gz \
  deploy/docker-compose.production.yml \
  apps/ml-analytics/.env \
  apps/ml-analytics/requirements.txt
```

---

**Questions or Issues?**

Contact the ML Team:

- **Slack**: #ml-analytics-support
- **Email**: ml-team@internal.inventoryiq.com
- **Docs**: https://docs.internal.inventoryiq.com/ml-service

---

_Last Updated: December 2024_
_Version: 1.0.0_
_Supported Python: 3.11+_
_Supported Docker: 20.10+_
