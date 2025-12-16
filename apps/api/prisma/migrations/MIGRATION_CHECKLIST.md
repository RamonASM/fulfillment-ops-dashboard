# Migration Deployment Checklist

Use this checklist when deploying migrations to production.

## Pre-Deployment (1 Day Before)

### Planning

- [ ] Review all migration SQL files in detail
- [ ] Identify any breaking changes or data transformations
- [ ] Estimate downtime required (if any)
- [ ] Schedule maintenance window
- [ ] Notify stakeholders of planned deployment
- [ ] Prepare rollback plan

### Testing

- [ ] Apply migrations to development environment
- [ ] Run full test suite
- [ ] Apply migrations to staging environment
- [ ] Perform manual QA on staging
- [ ] Load test with production-like data volume
- [ ] Verify application compatibility

### Backup Strategy

- [ ] Verify backup system is functioning
- [ ] Plan for on-demand backup before migration
- [ ] Test backup restoration process
- [ ] Ensure backup retention policy is set
- [ ] Document backup location

### Documentation

- [ ] Review MIGRATION_GUIDE.md
- [ ] Prepare deployment runbook
- [ ] Document any manual steps required
- [ ] List services that need restart
- [ ] Identify monitoring dashboards to watch

## Deployment Day

### Pre-Migration (T-1 hour)

#### Communication

- [ ] Send deployment start notification
- [ ] Enable maintenance mode (if applicable)
- [ ] Update status page

#### Environment Check

- [ ] Verify DATABASE_URL is set correctly
- [ ] Check database server health
- [ ] Check disk space (ensure 2x current DB size available)
- [ ] Verify PostgreSQL version (11+ required)
- [ ] Check active connections (close non-essential)

#### Final Backup

- [ ] Create database backup:
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Verify backup file size is reasonable
- [ ] Store backup in secure location
- [ ] Document backup timestamp and location

### Migration Execution (T-0)

#### Pre-Flight Checks

- [ ] Stop application servers (optional, for zero-downtime migrations)
- [ ] Clear application caches
- [ ] Check migration status:
  ```bash
  npx prisma migrate status
  ```

#### Apply Migrations

- [ ] Run migration script:

  ```bash
  ./prisma/migrations/apply-all-migrations.sh
  ```

  OR manually:

  ```bash
  npx prisma migrate deploy
  npx prisma generate
  ```

- [ ] Monitor for errors in real-time
- [ ] Check database logs for warnings
- [ ] Verify migration status:
  ```bash
  npx prisma migrate status
  ```

#### Validation

- [ ] Run schema validation:

  ```bash
  ./prisma/migrations/validate-schema.sh
  ```

- [ ] Check that all tables exist:

  ```bash
  psql $DATABASE_URL -c "\dt"
  ```

- [ ] Verify key columns exist:

  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'products' AND column_name = 'unit_cost';
  ```

- [ ] Check foreign key constraints:
  ```sql
  SELECT constraint_name FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY';
  ```

#### Data Population

- [ ] Run data population script:

  ```bash
  npx ts-node prisma/migrations/populate-initial-data.ts
  ```

- [ ] Verify data populated correctly:
  ```sql
  SELECT COUNT(*) FROM budgets;
  SELECT COUNT(*) FROM dashboard_layouts;
  SELECT COUNT(*) FROM user_preferences;
  SELECT COUNT(*) FROM benchmark_participation;
  ```

### Post-Migration (T+15 min)

#### Application Startup

- [ ] Start application servers
- [ ] Monitor startup logs for errors
- [ ] Check that Prisma Client is loaded
- [ ] Verify application can connect to database

#### Smoke Tests

- [ ] Test authentication (admin login)
- [ ] Test authentication (portal user login)
- [ ] View client list
- [ ] View product list
- [ ] View alerts
- [ ] Create test order request
- [ ] View dashboard
- [ ] Test new features:
  - [ ] Budget tracking
  - [ ] Shipment tracking
  - [ ] Dashboard personalization
  - [ ] Lead time calculations

#### Performance Monitoring

- [ ] Check response times
- [ ] Monitor database query performance
- [ ] Check database connection pool
- [ ] Monitor server resources (CPU, memory, disk I/O)
- [ ] Check for slow queries in logs

### Communication (T+30 min)

- [ ] Send deployment completion notification
- [ ] Update status page
- [ ] Disable maintenance mode
- [ ] Document any issues encountered
- [ ] Share success metrics

## Post-Deployment (First 24 Hours)

### Monitoring

- [ ] Monitor application logs
- [ ] Monitor database logs
- [ ] Check error tracking (Sentry, etc.)
- [ ] Monitor API response times
- [ ] Watch database performance metrics
- [ ] Check disk space usage

### Database Health

- [ ] Monitor table sizes:

  ```sql
  SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  ```

- [ ] Check index usage:

  ```sql
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  ORDER BY idx_scan DESC;
  ```

- [ ] Monitor query performance:
  ```sql
  SELECT query, calls, total_time, mean_time
  FROM pg_stat_statements
  ORDER BY mean_time DESC
  LIMIT 10;
  ```

### User Feedback

- [ ] Collect user feedback on new features
- [ ] Monitor support tickets
- [ ] Track feature adoption metrics
- [ ] Document user-reported issues

### Data Validation

- [ ] Verify financial data accuracy
- [ ] Check lead time calculations
- [ ] Validate shipment tracking
- [ ] Review benchmark participation
- [ ] Confirm dashboard layouts work

## Rollback Procedure (If Needed)

### Decision Criteria

Rollback if:

- [ ] Critical bugs preventing core functionality
- [ ] Data corruption detected
- [ ] Severe performance degradation
- [ ] Multiple user-facing errors
- [ ] Database instability

### Rollback Steps

1. **Enable Maintenance Mode**
   - [ ] Notify users
   - [ ] Stop application servers

2. **Database Restoration**
   - [ ] Verify backup integrity
   - [ ] Drop current database:
     ```bash
     dropdb fulfillment_ops_db
     ```
   - [ ] Create fresh database:
     ```bash
     createdb fulfillment_ops_db
     ```
   - [ ] Restore from backup:
     ```bash
     psql $DATABASE_URL < backup_TIMESTAMP.sql
     ```

3. **Application Rollback**
   - [ ] Revert to previous application version
   - [ ] Regenerate Prisma Client for old schema
   - [ ] Start application servers

4. **Verification**
   - [ ] Run smoke tests
   - [ ] Verify data integrity
   - [ ] Check application functionality

5. **Communication**
   - [ ] Notify stakeholders of rollback
   - [ ] Document reason for rollback
   - [ ] Plan remediation

## Post-Deployment Review (Within 1 Week)

- [ ] Review deployment process
- [ ] Document lessons learned
- [ ] Update deployment procedures
- [ ] Review monitoring and alerting
- [ ] Analyze performance impact
- [ ] Gather user satisfaction feedback
- [ ] Update documentation based on findings
- [ ] Plan for future migrations

## Sign-Off

| Role             | Name       | Date           | Signature  |
| ---------------- | ---------- | -------------- | ---------- |
| Database Admin   | ****\_**** | **_/_**/\_\_\_ | ****\_**** |
| DevOps Lead      | ****\_**** | **_/_**/\_\_\_ | ****\_**** |
| Application Lead | ****\_**** | **_/_**/\_\_\_ | ****\_**** |
| QA Lead          | ****\_**** | **_/_**/\_\_\_ | ****\_**** |

## Notes

Document any deviations from the plan or issues encountered:

```
[Add notes here]
```
