# Pre-Deployment Checklist - ML Analytics & Enhanced Portal

**Date**: December 16, 2024
**Version**: 1.0.0
**Deployment Type**: Docker Production
**Target Environment**: Production Server (yourtechassist.us)

---

## 🎯 Deployment Scope

This deployment includes:

- ✅ Enhanced Portal Analytics (Feature 4)
- ✅ ML Analytics Service (Feature 5)
- ✅ 197 comprehensive tests across all layers
- ✅ UI polish with 11 new/modified components

---

## 📋 Pre-Deployment Checklist

### 1. Infrastructure Configuration ⚙️

#### Database Setup

- [ ] **PostgreSQL has 30+ days of transaction data**

  ```bash
  # Check transaction data age
  docker exec inventory-postgres psql -U inventory -d inventory_db -c \
    "SELECT MIN(date_submitted), MAX(date_submitted), COUNT(*) FROM transactions;"
  ```

  - **Required**: At least 30 days of data for ML forecasting
  - **Status**: _Needs verification_

- [ ] **Database migrations are up to date**
  ```bash
  cd apps/api && npx prisma db push --skip-generate
  ```

  - **Status**: _Pending execution_

#### Environment Variables

- [ ] **ML_ANALYTICS_URL configured in .env**

  ```bash
  # Check if ML_ANALYTICS_URL is set
  grep "ML_ANALYTICS_URL" deploy/.env
  ```

  - **Expected**: `ML_ANALYTICS_URL=http://ml-analytics:8000`
  - **Status**: _Needs verification_

- [ ] **JWT secrets generated and secure**

  ```bash
  # Generate new secrets if needed
  echo "JWT_SECRET=$(openssl rand -base64 32)"
  echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
  echo "SESSION_SECRET=$(openssl rand -base64 32)"
  ```

  - **Status**: _Needs verification_

- [ ] **SMTP/Email configured (for notifications)**
  - Required for stockout alerts and reorder reminders
  - **Status**: _Optional but recommended_

#### Docker Images

- [ ] **All Docker images build successfully**

  ```bash
  # Build API and Web images
  docker-compose -f deploy/docker-compose.production.yml build api
  docker-compose -f deploy/docker-compose.production.yml build web

  # Build ML Analytics image
  docker-compose -f deploy/docker-compose.production.yml build ml-analytics
  ```

  - **Status**: _Pending execution_

### 2. Testing & Quality Assurance 🧪

- [ ] **Unit tests passing (108 tests)**

  ```bash
  npm run test
  ```

  - **Expected**: 108/108 tests passing
  - **Status**: _Pending execution_

- [ ] **Integration tests passing (22 tests)**

  ```bash
  npm run test -- apps/api/src/__tests__/integration
  ```

  - **Expected**: 22/22 tests passing
  - **Status**: _Pending execution_

- [ ] **E2E tests passing (37 tests)**

  ```bash
  npm run test:e2e
  ```

  - **Expected**: 37/37 tests passing
  - **Status**: _Pending execution_

- [ ] **Python ML tests passing (25 tests)**

  ```bash
  cd apps/ml-analytics
  pytest tests/ -v
  ```

  - **Expected**: 25/25 tests passing
  - **Status**: _Pending execution_

- [ ] **Docker integration test passing (5 tests)**
  ```bash
  npm run test -- tests/docker-integration.test.ts
  ```

  - **Expected**: 5/5 tests passing
  - **Status**: _Pending execution_

### 3. Backup & Rollback Preparation 💾

- [ ] **Create production database backup**

  ```bash
  bash deploy/scripts/backup-db-docker.sh
  ```

  - **Status**: _Pending execution_

- [ ] **Verify backup integrity**

  ```bash
  # Check backup exists and can be decompressed
  ls -lh deploy/backups/daily/
  gunzip -t deploy/backups/daily/inventory_db_*.sql.gz
  ```

  - **Status**: _Pending execution_

- [ ] **Test backup restoration (on staging/local)**

  ```bash
  # Restore to test database to verify backup works
  gunzip < deploy/backups/daily/inventory_db_*.sql.gz | \
    docker exec -i inventory-postgres psql -U inventory -d test_restore_db
  ```

  - **Status**: _Optional but recommended_

- [ ] **Rollback script verified**
  ```bash
  # Check rollback script exists and is executable
  ls -lh deploy/scripts/rollback.sh
  bash -n deploy/scripts/rollback.sh  # Syntax check
  ```

  - **Status**: _Needs verification_

### 4. ML Service Verification 🤖

- [ ] **ML service starts locally**

  ```bash
  cd apps/ml-analytics
  python3 main.py
  ```

  - **Expected**: Service starts on port 8000
  - **Status**: _Pending execution_

- [ ] **ML health endpoint responds**

  ```bash
  curl http://localhost:8000/health
  ```

  - **Expected**: `{"status":"healthy","service":"ml-analytics","database":"connected"}`
  - **Status**: _Pending execution_

- [ ] **Sample forecast generates successfully**

  ```bash
  # Get a product ID with 30+ days of data
  # Then test forecast generation
  curl -X POST http://localhost:8000/forecast/demand \
    -H "Content-Type: application/json" \
    -d '{"product_id":"PRODUCT_ID_HERE","horizon_days":30}'
  ```

  - **Expected**: Forecast with predictions and metrics
  - **Status**: _Pending execution_

- [ ] **ML dependencies installed**
  ```bash
  cd apps/ml-analytics
  pip install -r requirements.txt
  ```

  - **Expected**: prophet, pandas, fastapi, sqlalchemy installed
  - **Status**: _Pending execution_

### 5. Security & Access Control 🔒

- [ ] **API authentication working**

  ```bash
  # Test JWT authentication
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test1234"}'
  ```

  - **Status**: _Needs verification_

- [ ] **ML routes require authentication**

  ```bash
  # Should return 401 without token
  curl http://localhost:3001/api/ml/health
  ```

  - **Expected**: 401 Unauthorized
  - **Status**: _Needs verification_

- [ ] **CORS origins configured correctly**
  - Check `.env` has correct `CORS_ORIGINS`
  - **Status**: _Needs verification_

- [ ] **Rate limiting configured**
  - API rate limits set in `.env`
  - **Status**: _Needs verification_

### 6. Performance & Monitoring 📊

- [ ] **Health check script runs successfully**

  ```bash
  bash deploy/scripts/health-check.sh
  ```

  - **Expected**: All checks pass
  - **Status**: _Pending execution_

- [ ] **API response time <500ms**

  ```bash
  # Test API performance
  time curl http://localhost:3001/health
  ```

  - **Expected**: <500ms
  - **Status**: _Pending execution_

- [ ] **ML forecast response time <30s**

  ```bash
  # Time a forecast request
  time curl -X POST http://localhost:8000/forecast/demand \
    -H "Content-Type: application/json" \
    -d '{"product_id":"PRODUCT_ID_HERE","horizon_days":30}'
  ```

  - **Expected**: <30 seconds
  - **Status**: _Pending execution_

- [ ] **Logging configured**
  - Check `LOG_LEVEL` in `.env`
  - Verify log files are being written
  - **Status**: _Needs verification_

### 7. Docker Deployment Readiness 🐳

- [ ] **docker-compose.production.yml reviewed**
  - All services defined: postgres, redis, api, ml-analytics, web
  - Correct environment variables mapped
  - Health checks configured
  - **Status**: _Needs review_

- [ ] **Docker network connectivity verified**

  ```bash
  # Start services and check network
  docker-compose -f deploy/docker-compose.production.yml up -d
  docker network inspect inventory-network
  ```

  - **Status**: _Pending execution_

- [ ] **Docker volumes configured**
  - postgres_data, redis_data, uploads_data, ml_models, backup_data
  - **Status**: _Needs verification_

- [ ] **Container resource limits set**
  - Memory limits for ML service (minimum 2GB)
  - CPU limits if needed
  - **Status**: _Optional_

### 8. Frontend Build & Assets 🎨

- [ ] **Web dashboard builds successfully**

  ```bash
  npm run build:web
  ```

  - **Status**: _Pending execution_

- [ ] **Client portal builds successfully**

  ```bash
  npm run build:portal
  ```

  - **Status**: _Pending execution_

- [ ] **Static assets are optimized**
  - Check bundle sizes
  - Verify code splitting
  - **Status**: _Optional_

### 9. Documentation & Communication 📚

- [ ] **Deployment runbook reviewed**
  - Check `deploy/DEPLOYMENT-COMPREHENSIVE.md`
  - **Status**: _Needs review_

- [ ] **Stakeholders notified**
  - Account managers aware of new ML features
  - Clients notified of enhanced portal (optional)
  - **Status**: _Pending_

- [ ] **Maintenance window scheduled**
  - Preferred: Off-hours deployment (evening/weekend)
  - **Status**: _Pending scheduling_

### 10. Post-Deployment Verification Plan ✅

- [ ] **Smoke tests defined**
  1. Login to admin dashboard
  2. Navigate to ML Analytics page
  3. View forecast for a product
  4. Login to client portal
  5. View analytics dashboard
  6. Check ML service health
  - **Status**: _Documented above_

- [ ] **Rollback criteria defined**
  - **Trigger**: Critical errors, >5% failure rate, ML service down >30min
  - **Action**: Execute rollback script, restore database backup
  - **Status**: _Documented_

---

## 🚨 Go/No-Go Criteria

### MUST HAVE (Blocking):

- ✅ All 197 tests passing
- ✅ Database backup created and verified
- ✅ Docker images build successfully
- ✅ ML service starts and responds to health checks
- ✅ API authentication working

### SHOULD HAVE (Recommended):

- ⚠️ Transaction data ≥30 days (ML forecasts need this)
- ⚠️ Health check script passing
- ⚠️ SMTP/Email configured for notifications

### NICE TO HAVE (Optional):

- 📝 E2E tests passing (can run post-deployment)
- 📝 Monitoring/alerting configured
- 📝 Stakeholder communication completed

---

## 📝 Execution Checklist

When ready to deploy:

1. ✅ All MUST HAVE items checked
2. ✅ Backup created and verified
3. ✅ Maintenance window confirmed
4. ✅ Team on standby for monitoring
5. ✅ Rollback plan ready

**Sign-off**:

- Developer: ********\_******** Date: **\_\_\_**
- QA: **********\_\_\_********** Date: **\_\_\_**
- DevOps: ********\_\_\_******** Date: **\_\_\_**

---

## 🔄 Next Steps

After checklist completion:

1. Execute deployment: `bash deploy/scripts/deploy-docker.sh`
2. Run health checks: `bash deploy/scripts/health-check.sh`
3. Perform smoke tests (see section 10)
4. Monitor for 15-30 minutes
5. Update documentation with deployment notes

---

**Generated**: 2024-12-16
**Last Updated**: 2024-12-16
**Status**: DRAFT - Awaiting verification
