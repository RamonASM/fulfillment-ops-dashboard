# DS Analytics Service - Deployment & Rollout Plan

## Overview

This document outlines the test-driven deployment strategy for activating the DS Analytics Python service in production. The service provides advanced usage calculations using multiple statistical methods.

---

## Phase 4.1: Pre-Deployment Checklist

### Local Environment Requirements
- [ ] Python 3.11+ installed
- [ ] PostgreSQL running locally with `inventory_db`
- [ ] Virtual environment created
- [ ] Dependencies installed
- [ ] Environment variables configured

### Production Server Requirements
- [ ] Python 3.11+ on server (138.197.70.205)
- [ ] PostgreSQL accessible (already running)
- [ ] Port 8000 available
- [ ] systemd available for service management

---

## Phase 4.2: Local Testing

### Step 1: Set Up Local Python Environment

```bash
cd /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/ds-analytics

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env <<EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inventory_db
PORT=8000
WORKERS=1
LOG_LEVEL=debug
EOF
```

### Step 2: Start DS Analytics Service

```bash
# In one terminal
cd apps/ds-analytics
source venv/bin/activate
python main.py
# Should see: "Uvicorn running on http://0.0.0.0:8000"
```

### Step 3: Manual Health Check

```bash
# Health check
curl http://localhost:8000/health | jq '.'
# Expected: {"status":"healthy","database_connected":true,"version":"1.0.0",...}

# Stats check
curl http://localhost:8000/stats | jq '.'
# Expected: {"total_products":N,"products_with_usage":N,...}
```

### Step 4: Test Calculation Endpoint

```bash
# Get a test product ID
PRODUCT_ID=$(curl -s http://localhost:3001/api/clients | jq -r '.data[0].id' | xargs -I{} curl -s "http://localhost:3001/api/clients/{}/products?type=evergreen" | jq -r '.data[0].id')

# Test calculation
curl -X POST http://localhost:8000/calculate-usage \
  -H "Content-Type: application/json" \
  -d "{\"product_ids\":[\"$PRODUCT_ID\"],\"client_id\":\"CLIENT_ID\"}" | jq '.'
```

---

## Phase 4.3: Integration Tests

### Test Suite Location
`apps/ds-analytics/tests/` and `apps/api/src/__tests__/ds-analytics.test.ts`

### Key Test Cases

#### 1. Health Check Test
```python
# tests/test_health.py
def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["database_connected"] == True
```

#### 2. Usage Calculation Tests
```python
# tests/test_calculations.py
def test_calculate_usage_with_valid_product():
    """Test that calculation returns expected fields"""
    response = client.post("/calculate-usage", json={
        "product_ids": ["test-product-id"],
        "client_id": "test-client-id"
    })
    assert response.status_code == 200
    result = response.json()[0]
    assert "monthly_usage_units" in result
    assert "confidence_score" in result
    assert "calculation_method" in result

def test_calculate_usage_with_no_data():
    """Test graceful handling of products with no transaction data"""
    response = client.post("/calculate-usage", json={
        "product_ids": ["nonexistent-product"],
        "client_id": "test-client"
    })
    assert response.status_code == 200
    # Should return empty array or product with null usage
```

#### 3. Node.js Integration Test
```typescript
// apps/api/src/__tests__/ds-analytics-integration.test.ts
describe("DS Analytics Integration", () => {
  it("should fall back to TypeScript when DS Analytics is down", async () => {
    // Disable DS Analytics for client
    // Call recalculateClientUsage
    // Verify method is "typescript"
  });

  it("should use DS Analytics when enabled and healthy", async () => {
    // Enable DS Analytics for client
    // Ensure service is running
    // Call recalculateClientUsage
    // Verify method is "ds_analytics"
  });

  it("should compare DS and TS results within 10% variance", async () => {
    // Calculate with both methods
    // Compare monthly_usage_units
    // Assert difference < 10%
  });
});
```

### Running Tests

```bash
# Python tests
cd apps/ds-analytics
source venv/bin/activate
pytest tests/ -v

# Node.js tests
cd apps/api
npm run test -- --grep "DS Analytics"
```

---

## Phase 4.4: Production Deployment

### Step 1: Copy Files to Server

```bash
# From local machine
rsync -avz --progress \
  -e "ssh -i ~/.ssh/id_ed25519_deploy" \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '*.pyc' \
  /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/ds-analytics/ \
  root@138.197.70.205:/var/www/inventory/apps/ds-analytics/
```

### Step 2: Set Up Python Environment on Server

```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205

cd /var/www/inventory/apps/ds-analytics

# Install Python 3.11 if not present
apt update
apt install -y python3.11 python3.11-venv python3-pip

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Configure Environment

```bash
# Get database password from existing .env
DB_PASSWORD=$(grep DATABASE_URL /var/www/inventory/apps/api/.env | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')

# Create .env for DS Analytics
cat > /var/www/inventory/apps/ds-analytics/.env <<EOF
DATABASE_URL=postgresql://inventory_admin:${DB_PASSWORD}@localhost:5432/inventory_db
PORT=8000
WORKERS=4
LOG_LEVEL=info
EOF
```

### Step 4: Create systemd Service

```bash
cat > /etc/systemd/system/ds-analytics.service <<EOF
[Unit]
Description=DS Analytics Python Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/inventory/apps/ds-analytics
EnvironmentFile=/var/www/inventory/apps/ds-analytics/.env
ExecStart=/var/www/inventory/apps/ds-analytics/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

# Resource limits
MemoryMax=2G
CPUQuota=200%

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ds-analytics

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
systemctl daemon-reload
systemctl enable ds-analytics
systemctl start ds-analytics
systemctl status ds-analytics
```

### Step 5: Verify Service is Running

```bash
# Health check
curl http://localhost:8000/health

# Check logs
journalctl -u ds-analytics -f --no-pager
```

### Step 6: Update Node.js API Configuration

```bash
# Add DS_ANALYTICS_URL to API .env
echo "DS_ANALYTICS_URL=http://localhost:8000" >> /var/www/inventory/apps/api/.env

# Restart Node.js API
pm2 restart inventory-api

# Verify API can reach DS Analytics
curl -s http://localhost:3001/api/admin/ds-analytics/health
# Should return {"healthy": true}
```

---

## Phase 4.5: Gradual Rollout

### Week 1: Pilot Client (1 client)

**Select pilot client:** Thumbprint (has most data, active usage)

```bash
# Enable DS Analytics for pilot
TOKEN=$(curl -s -X POST https://admin.yourtechassist.us/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@inventoryiq.com","password":"demo1234"}' | jq -r '.accessToken')

# Get Thumbprint client ID
THUMBPRINT_ID=$(curl -s "https://admin.yourtechassist.us/api/admin/ds-analytics/clients" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.clientName=="Thumbprint") | .clientId')

# Enable DS Analytics
curl -X PATCH "https://admin.yourtechassist.us/api/admin/ds-analytics/clients/$THUMBPRINT_ID/enable" \
  -H "Authorization: Bearer $TOKEN"

# Run test calculation
curl -X POST "https://admin.yourtechassist.us/api/admin/ds-analytics/test-client/$THUMBPRINT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
# Verify: "method": "ds_analytics"
```

**Monitoring checklist:**
- [ ] Check calculation method is "ds_analytics" not "fallback"
- [ ] Compare usage values with previous TypeScript calculations
- [ ] Monitor for errors in logs: `journalctl -u ds-analytics -f`
- [ ] Verify daily recalculation job uses DS Analytics

### Week 2: 25% Rollout (2 clients)

**Enable for additional client:**
```bash
# Enable for EVE client
EVE_ID=$(curl -s "https://admin.yourtechassist.us/api/admin/ds-analytics/clients" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.clientName=="EVE") | .clientId')

curl -X PATCH "https://admin.yourtechassist.us/api/admin/ds-analytics/clients/$EVE_ID/enable" \
  -H "Authorization: Bearer $TOKEN"
```

**Validation:**
- [ ] Both clients processing via DS Analytics
- [ ] No calculation errors in past 7 days
- [ ] Usage values are reasonable (not 0 or extreme outliers)

### Week 3: 50% Rollout (3 clients)

```bash
# Enable for GlobalMed
curl -X PATCH "https://admin.yourtechassist.us/api/admin/ds-analytics/clients/GLOBALMED_ID/enable" \
  -H "Authorization: Bearer $TOKEN"
```

### Week 4: 100% Rollout

```bash
# Enable for all remaining clients
curl -X POST "https://admin.yourtechassist.us/api/admin/ds-analytics/enable-all" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Rollback Procedure

### Emergency Rollback (All Clients)

```bash
# Disable DS Analytics for all clients immediately
curl -X POST "https://admin.yourtechassist.us/api/admin/ds-analytics/disable-all" \
  -H "Authorization: Bearer $TOKEN"

# All clients will fall back to TypeScript calculations
```

### Per-Client Rollback

```bash
# Disable for specific client
curl -X PATCH "https://admin.yourtechassist.us/api/admin/ds-analytics/clients/CLIENT_ID/disable" \
  -H "Authorization: Bearer $TOKEN"
```

### Service Rollback

```bash
# Stop DS Analytics service
systemctl stop ds-analytics

# Remove DS_ANALYTICS_URL from API
sed -i '/DS_ANALYTICS_URL/d' /var/www/inventory/apps/api/.env

# Restart API (will fall back to TypeScript for all)
pm2 restart inventory-api
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Service Health**
   - Endpoint: `GET /health`
   - Alert if: `database_connected: false` or HTTP 5xx

2. **Calculation Success Rate**
   - Check logs for: `"event": "usage_calculated"`
   - Alert if: Error rate > 5%

3. **Calculation Duration**
   - Normal: < 100ms per product
   - Alert if: > 500ms average

4. **Memory Usage**
   - Monitor: `systemctl status ds-analytics`
   - Alert if: > 1.5GB

### Log Monitoring Commands

```bash
# Watch for errors
journalctl -u ds-analytics -f | grep -E '"level":"error"|"level":"warning"'

# Check calculation stats
journalctl -u ds-analytics --since "1 hour ago" | grep "usage_calculated" | wc -l

# Check method distribution
journalctl -u ds-analytics --since "1 day ago" | grep "calculation_method" | sort | uniq -c
```

---

## Comparison: DS Analytics vs TypeScript

### Use the Compare Endpoint

```bash
# Compare results for a specific product
curl -X POST "https://admin.yourtechassist.us/api/admin/ds-analytics/compare/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Expected output shows both methods' results and difference %
```

### Expected Differences

| Metric | Acceptable Variance |
|--------|---------------------|
| monthly_usage_units | < 10% |
| monthly_usage_packs | < 10% |
| weeks_remaining | < 15% |
| confidence_score | DS typically higher |

### When DS Analytics is Better

1. **Hybrid calculation**: Combines order and snapshot data
2. **Seasonality detection**: Identifies patterns TypeScript misses
3. **Outlier handling**: IQR-based filtering
4. **Confidence scoring**: More accurate data quality assessment

---

## Success Criteria

### Phase 4.2 (Local Testing) - Complete when:
- [ ] Service starts without errors
- [ ] Health check returns `healthy: true`
- [ ] Test calculation returns valid data
- [ ] All Python tests pass

### Phase 4.3 (Integration Tests) - Complete when:
- [ ] Python unit tests pass
- [ ] Node.js integration tests pass
- [ ] Compare endpoint shows < 10% variance

### Phase 4.4 (Production Deployment) - Complete when:
- [ ] Service running on production server
- [ ] systemd auto-restart working
- [ ] Node.js API can reach service
- [ ] Admin endpoints show `healthy: true`

### Phase 4.5 (Rollout) - Complete when:
- [ ] All clients enabled for DS Analytics
- [ ] 7 days with no rollback needed
- [ ] Daily recalculation uses DS Analytics
- [ ] No calculation errors in logs

---

## Timeline Summary

| Phase | Duration | Activities |
|-------|----------|------------|
| 4.2 | Day 1 | Local testing |
| 4.3 | Day 1-2 | Write & run integration tests |
| 4.4 | Day 2 | Production deployment |
| 4.5 Week 1 | Days 3-9 | Pilot client |
| 4.5 Week 2 | Days 10-16 | 25% rollout |
| 4.5 Week 3 | Days 17-23 | 50% rollout |
| 4.5 Week 4 | Days 24-30 | 100% rollout |

---

## Commands Quick Reference

```bash
# Local development
cd apps/ds-analytics && source venv/bin/activate && python main.py

# Production service management
systemctl start ds-analytics
systemctl stop ds-analytics
systemctl restart ds-analytics
systemctl status ds-analytics
journalctl -u ds-analytics -f

# Rollout management
curl -X PATCH ".../clients/ID/enable" -H "Authorization: Bearer $TOKEN"
curl -X PATCH ".../clients/ID/disable" -H "Authorization: Bearer $TOKEN"
curl -X POST ".../enable-all" -H "Authorization: Bearer $TOKEN"
curl -X POST ".../disable-all" -H "Authorization: Bearer $TOKEN"
```

---

*Created: 2025-12-17*
*Status: Ready for Phase 4.2 (Local Testing)*
