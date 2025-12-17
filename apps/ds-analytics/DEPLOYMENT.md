# DS Analytics Service - Deployment Guide

## Quick Start (Development)

### 1. Local Python Service

```bash
# Navigate to ds-analytics directory
cd apps/ds-analytics

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inventory_db

# Run the service
python main.py
```

Service will be available at `http://localhost:8000`

### 2. Update Node.js Backend

```bash
# Add environment variable to .env
echo "DS_ANALYTICS_URL=http://localhost:8000" >> apps/api/.env

# Rebuild if needed
cd apps/api
npm run build
npm start
```

### 3. Run Database Migration

```bash
cd apps/api
npx prisma db push

# Or run SQL migration manually:
psql postgresql://postgres:postgres@localhost:5432/inventory_db \
  -f prisma/migrations/ds_analytics_fields/migration.sql
```

### 4. Test the Integration

```bash
# Health check
curl http://localhost:8000/health

# Stats
curl http://localhost:8000/stats

# Test calculation (replace IDs with real ones)
curl -X POST http://localhost:8000/calculate-usage \
  -H "Content-Type: application/json" \
  -d '{
    "product_ids": ["your-product-id"],
    "client_id": "your-client-id"
  }'
```

## Docker Deployment

### Development with Docker Compose

```bash
# From project root
docker-compose -f docker-compose.dev.yml up --build

# Services started:
# - postgres (5432)
# - redis (6379)
# - ds-analytics (8000)
# - api (3001)
```

### Production Deployment

#### Option 1: Standalone Python Service

```bash
# Build image
docker build -t ds-analytics:latest apps/ds-analytics/

# Run container
docker run -d \
  --name ds-analytics \
  -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e REDIS_URL="redis://host:6379/0" \
  --restart unless-stopped \
  ds-analytics:latest
```

#### Option 2: Deploy to Production Server

**1. Copy files to server:**

```bash
# From local machine
scp -r apps/ds-analytics root@yourtechassist.us:/var/www/inventory/
```

**2. On server, create systemd service:**

```bash
sudo nano /etc/systemd/system/ds-analytics.service
```

```ini
[Unit]
Description=DS Analytics Service
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/inventory/ds-analytics
Environment="DATABASE_URL=postgresql://postgres:password@localhost:5432/inventory_db"
Environment="PORT=8000"
Environment="WORKERS=4"
ExecStart=/var/www/inventory/ds-analytics/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**3. Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable ds-analytics
sudo systemctl start ds-analytics
sudo systemctl status ds-analytics
```

**4. Configure nginx reverse proxy:**

```nginx
# Add to /etc/nginx/sites-available/inventory

location /ds-analytics/ {
    proxy_pass http://localhost:8000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**5. Reload nginx:**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

**6. Update Node.js API environment:**

```bash
# Edit /var/www/inventory/.env
echo "DS_ANALYTICS_URL=http://localhost:8000" >> /var/www/inventory/.env

# Restart API
pm2 restart inventory-api
```

## Production Checklist

- [ ] Python 3.11+ installed
- [ ] PostgreSQL accessible from Python service
- [ ] Redis installed (optional, for caching)
- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] Service running and healthy (`/health` returns 200)
- [ ] Node.js API can reach Python service
- [ ] Logs are being written
- [ ] Monitoring/alerts configured

## Environment Variables

### Required

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### Optional

```bash
PORT=8000                    # Service port (default: 8000)
WORKERS=4                    # Number of uvicorn workers (default: 4)
LOG_LEVEL=info              # Logging level (default: info)
REDIS_URL=redis://host:6379 # For caching (optional)
```

## Monitoring

### Health Checks

```bash
# Service health
curl http://localhost:8000/health

# Expected response:
{
  "status": "healthy",
  "database_connected": true,
  "version": "1.0.0",
  "timestamp": "2025-12-16T..."
}
```

### Logs

```bash
# Docker
docker logs -f ds-analytics

# Systemd
sudo journalctl -u ds-analytics -f

# Log file (if configured)
tail -f /var/log/ds-analytics/app.log
```

### Metrics (Prometheus)

Metrics available at `/metrics`:

```
# HELP usage_calculations_total Total calculations
# TYPE usage_calculations_total counter
usage_calculations_total{method="hybrid",confidence="high"} 150
usage_calculations_total{method="order_fulfillment",confidence="medium"} 45

# HELP usage_calculation_duration_seconds Calculation duration
# TYPE usage_calculation_duration_seconds histogram
usage_calculation_duration_seconds_bucket{method="hybrid",le="0.1"} 120
```

## Troubleshooting

### Service Won't Start

**Check database connection:**

```bash
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://user:pass@host:5432/db')
print('✅ Database connected')
"
```

**Check port conflicts:**

```bash
lsof -i :8000
# Kill conflicting process if needed
```

### High Memory Usage

**Reduce workers:**

```bash
# In .env or systemd service
WORKERS=2
```

**Monitor memory:**

```bash
docker stats ds-analytics
# or
ps aux | grep uvicorn
```

### Calculation Failures

**Check validation messages:**

```bash
curl -X POST http://localhost:8000/calculate-usage \
  -H "Content-Type: application/json" \
  -d '{"product_ids":["prod-123"],"client_id":"client-456"}' \
  | jq '.[] | .validation_messages'
```

**Review logs for errors:**

```bash
# Look for error-level logs
docker logs ds-analytics 2>&1 | grep '"level":"error"'
```

### No Data / Zero Usage

**Verify data exists:**

```sql
-- Check if transactions exist
SELECT COUNT(*) FROM transactions WHERE product_id = 'prod-123';

-- Check stock history
SELECT COUNT(*) FROM stock_history WHERE product_id = 'prod-123';
```

**Verify stock history snapshots are running:**

```bash
# In Node.js API logs, should see every 6 hours:
# "Created stock history snapshots"
```

## Scaling

### Horizontal Scaling

Run multiple instances behind a load balancer:

```bash
# Instance 1
docker run -d -p 8001:8000 ds-analytics:latest

# Instance 2
docker run -d -p 8002:8000 ds-analytics:latest

# Nginx load balancing
upstream ds_analytics {
    server localhost:8001;
    server localhost:8002;
}
```

### Vertical Scaling

Increase workers based on CPU cores:

```bash
# 4-core machine: 8 workers (2x cores)
# 8-core machine: 16 workers
WORKERS=16
```

## Backup & Disaster Recovery

### Database Backups

Monthly usage snapshots are stored in `monthly_usage_snapshots` table.
Include in regular PostgreSQL backups:

```bash
pg_dump -U postgres -t monthly_usage_snapshots inventory_db > usage_snapshots_backup.sql
```

### Service Recovery

If service crashes, systemd will auto-restart. Manual restart:

```bash
sudo systemctl restart ds-analytics
```

## Updates & Maintenance

### Updating Dependencies

```bash
cd apps/ds-analytics
source venv/bin/activate
pip install --upgrade -r requirements.txt
```

### Code Updates

```bash
# Pull latest code
git pull origin main

# Rebuild Docker image
docker build -t ds-analytics:latest apps/ds-analytics/

# Restart service
docker-compose restart ds-analytics
# or
sudo systemctl restart ds-analytics
```

### Schema Migrations

When database schema changes:

```bash
cd apps/api
npx prisma migrate dev
# or
npx prisma db push
```

## Performance Tuning

### Database Indexes

Ensure these indexes exist (added by migration):

```sql
CREATE INDEX idx_products_stock_status ON products(stock_status);
CREATE INDEX idx_products_usage_confidence ON products(usage_confidence);
CREATE INDEX idx_products_stockout_date ON products(projected_stockout_date);
CREATE INDEX idx_monthly_usage_product_month ON monthly_usage_snapshots(product_id, year_month);
```

### Connection Pooling

Adjust in `models/database.py`:

```python
engine = create_engine(
    DATABASE_URL,
    pool_size=10,        # Increase for more connections
    max_overflow=20,     # Extra connections when busy
    pool_pre_ping=True   # Test connections before use
)
```

### Caching (Future)

Add Redis caching for frequently accessed data:

```python
# Cache usage results for 1 hour
REDIS.setex(f"usage:{product_id}", 3600, json.dumps(result))
```

## Security

### API Authentication (Future Enhancement)

Add API key authentication:

```python
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != os.getenv("API_SECRET"):
        raise HTTPException(status_code=403, detail="Invalid API key")
```

### Network Security

- Run behind firewall
- Only allow connections from Node.js API
- Use HTTPS in production
- Limit rate of requests

## Support

For deployment issues:

1. Check health endpoint: `/health`
2. Review logs
3. Verify environment variables
4. Test database connectivity
5. Check firewall/network rules

Contact: devops@inventoryiq.com
