# Comprehensive Deployment Guide - Inventory Intelligence Platform

This guide covers multiple deployment strategies for the Inventory Intelligence Platform, from development to production.

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Prerequisites](#prerequisites)
3. [Docker Deployment](#docker-deployment)
4. [Traditional Server Deployment (PM2 + Nginx)](#traditional-server-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Database Migrations](#database-migrations)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup & Restore](#backup--restore)
10. [Troubleshooting](#troubleshooting)
11. [Rollback Procedures](#rollback-procedures)
12. [CI/CD with GitHub Actions](#cicd-with-github-actions)

---

## Deployment Overview

### Architecture Components

The platform consists of 5 main services:

1. **PostgreSQL** - Primary database (port 5432)
2. **Redis** - Cache and session store (port 6379)
3. **API Server** - Express.js backend (port 3001)
4. **Web Dashboard** - React admin interface (port 80/443)
5. **Client Portal** - React client interface (port 8080)
6. **ML Analytics** - Python FastAPI service (port 8000) [Optional]

### Deployment Options

| Option           | Best For                      | Complexity | Scalability |
| ---------------- | ----------------------------- | ---------- | ----------- |
| Docker Compose   | Development, Small Production | Low        | Medium      |
| PM2 + Nginx      | Traditional Hosting, VPS      | Medium     | Medium      |
| Kubernetes       | Large Scale, Enterprise       | High       | Very High   |
| Managed Services | Quick Start, Minimal Ops      | Low        | High        |

---

## Prerequisites

### System Requirements

**Minimum (Development):**

- 2 CPU cores
- 4 GB RAM
- 20 GB storage
- Ubuntu 20.04+ or similar Linux distribution

**Recommended (Production):**

- 4 CPU cores
- 8 GB RAM
- 50 GB SSD storage
- Ubuntu 22.04 LTS

### Software Dependencies

- **Node.js** 18.0+ (20.x recommended)
- **npm** 9.0+
- **PostgreSQL** 15+
- **Redis** 7+
- **Nginx** 1.18+
- **PM2** 5.0+ (for PM2 deployment)
- **Docker** 24.0+ & Docker Compose 2.0+ (for Docker deployment)
- **Python** 3.11+ (for ML Analytics)
- **Git** 2.30+

### Domain Setup

You'll need DNS records pointing to your server:

```
Type  Name     Value           TTL
A     @        YOUR_SERVER_IP  600
A     admin    YOUR_SERVER_IP  600
A     portal   YOUR_SERVER_IP  600
A     api      YOUR_SERVER_IP  600
```

---

## Docker Deployment

### Option 1: Quick Start (Development)

```bash
# Clone repository
git clone https://github.com/yourusername/fulfillment-ops-dashboard.git
cd fulfillment-ops-dashboard

# Start development environment
docker-compose -f deploy/docker-compose.dev.yml up -d

# View logs
docker-compose -f deploy/docker-compose.dev.yml logs -f
```

Access:

- Admin: http://localhost
- Portal: http://localhost:8080
- API: http://localhost:3001

### Option 2: Production Deployment

#### Step 1: Prepare Environment

```bash
# Navigate to deploy directory
cd /var/www/inventory/deploy

# Copy environment template
cp .env.production.example .env

# Edit configuration
nano .env
```

**Required environment variables:**

```bash
# Generate secure secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For JWT_REFRESH_SECRET
openssl rand -base64 32  # For SESSION_SECRET

# Update .env with:
DB_PASSWORD=your_secure_db_password
JWT_SECRET=generated_secret_1
JWT_REFRESH_SECRET=generated_secret_2
SESSION_SECRET=generated_secret_3
```

#### Step 2: Deploy Services

```bash
# Make scripts executable
chmod +x deploy/scripts/*.sh

# Run deployment
bash deploy/scripts/deploy-docker.sh production
```

#### Step 3: Verify Deployment

```bash
# Run health checks
bash deploy/scripts/health-check.sh

# Check logs
docker-compose -f deploy/docker-compose.production.yml logs -f api
```

### Docker Management Commands

```bash
# View all containers
docker-compose -f deploy/docker-compose.production.yml ps

# Restart a service
docker-compose -f deploy/docker-compose.production.yml restart api

# View logs
docker-compose -f deploy/docker-compose.production.yml logs -f [service_name]

# Stop all services
docker-compose -f deploy/docker-compose.production.yml down

# Backup database
bash deploy/scripts/backup-db-docker.sh

# Scale API service
docker-compose -f deploy/docker-compose.production.yml up -d --scale api=3
```

---

## Traditional Server Deployment

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Run server setup script
cd /var/www/inventory/deploy/scripts
chmod +x setup-server.sh
sudo bash setup-server.sh
```

This script installs:

- Node.js 20.x
- PostgreSQL 15
- Redis 7
- Nginx
- PM2
- Python 3.11 (for ML Analytics)
- Firewall configuration

### Step 2: Database Configuration

```bash
# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE inventory_db;
CREATE USER inventory_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE inventory_db TO inventory_user;
\c inventory_db
GRANT ALL ON SCHEMA public TO inventory_user;
EOF
```

### Step 3: Application Setup

```bash
# Navigate to project
cd /var/www/inventory

# Install dependencies
npm ci --production=false

# Build all applications
npm run build:shared
npm run build:api
npm run build:web
npm run build:portal

# Run database migrations
npm run db:push

# Seed database (first time only)
npm run db:seed
```

### Step 4: Configure Nginx

```bash
# Copy nginx configuration
sudo cp deploy/nginx/inventory.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/inventory.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 5: Setup SSL with Let's Encrypt

```bash
# Run SSL setup script
cd /var/www/inventory/deploy/scripts
sudo bash setup-ssl.sh
```

### Step 6: Start Application with PM2

```bash
# Start with PM2
pm2 start deploy/ecosystem.config.js --env production

# Save process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command that PM2 outputs
```

### Step 7: Deploy Static Files

```bash
# Create directories for static files
sudo mkdir -p /var/www/inventory/{admin,portal}

# Copy built files
sudo cp -r apps/web/dist/* /var/www/inventory/admin/
sudo cp -r apps/portal/dist/* /var/www/inventory/portal/

# Set permissions
sudo chown -R www-data:www-data /var/www/inventory/{admin,portal}
```

---

## Environment Configuration

### Development Environment

Create `apps/api/.env`:

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://inventory:inventory123@localhost:5432/inventory_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_change_in_production
WEB_URL=http://localhost:5173
PORTAL_URL=http://localhost:5174
```

### Staging Environment

Use `deploy/.env.staging.example` as template:

```bash
cp deploy/.env.staging.example deploy/.env
# Edit and configure for staging
```

### Production Environment

Use `deploy/.env.production.example` as template:

```bash
cp deploy/.env.production.example deploy/.env
# Configure with production values
```

**Critical Production Settings:**

1. **Database**: Strong password, connection pooling
2. **JWT Secrets**: Cryptographically secure, unique
3. **Cookie Settings**: `COOKIE_SECURE=true` for HTTPS
4. **CORS**: Restrict to your domains only
5. **Rate Limiting**: Configure based on traffic
6. **Email**: Configure SMTP for notifications
7. **Monitoring**: Enable Sentry or similar

---

## Database Migrations

### During Deployment

The platform uses Prisma for database management.

#### Docker Deployment

Migrations run automatically via entrypoint.sh:

```bash
# Manual migration
docker-compose -f deploy/docker-compose.production.yml exec api npx prisma db push
```

#### PM2 Deployment

```bash
cd /var/www/inventory
npm run db:push  # Sync schema without migration files
# or
npm run db:migrate  # If using migration files
```

### Creating Migrations

```bash
# Development workflow
npm run db:migrate  # Create migration
npm run db:push     # Push to database
npm run db:generate # Generate Prisma client
```

### Rollback Database

```bash
# Restore from backup
gunzip < deploy/backups/backup_TIMESTAMP_database.sql.gz | \
  psql -U inventory_user -d inventory_db
```

---

## SSL/TLS Configuration

### Automated Setup with Let's Encrypt

```bash
sudo bash deploy/scripts/setup-ssl.sh
```

### Manual SSL Configuration

1. Obtain SSL certificates from your provider
2. Place certificates in `/etc/letsencrypt/live/yourdomain.com/`
3. Update nginx configuration
4. Restart nginx: `sudo systemctl restart nginx`

### SSL Renewal

Let's Encrypt certificates auto-renew via cron. Test renewal:

```bash
sudo certbot renew --dry-run
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# View logs
pm2 logs inventory-api
pm2 logs inventory-api --lines 100
pm2 logs inventory-api --err  # Error logs only

# Process status
pm2 status
pm2 describe inventory-api
```

### Docker Logging

```bash
# View logs
docker-compose -f deploy/docker-compose.production.yml logs -f api

# Log rotation is handled automatically by Docker
```

### Application Logs

Logs are stored in `/var/www/inventory/logs/`:

```bash
tail -f /var/www/inventory/logs/api-error.log
tail -f /var/www/inventory/logs/api-out.log
```

### Nginx Logs

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Health Checks

```bash
# Comprehensive health check
bash deploy/scripts/health-check.sh

# Manual endpoint checks
curl http://localhost:3001/health
curl http://localhost/health
curl http://localhost:8080/health
```

---

## Backup & Restore

### Automated Backups

#### Docker Environment

```bash
# Setup automated backups (cron)
crontab -e
# Add: 0 2 * * * /var/www/inventory/deploy/scripts/backup-db-docker.sh

# Manual backup
bash deploy/scripts/backup-db-docker.sh
```

#### PM2 Environment

```bash
# Backup script from deploy/scripts/backup-db.sh
bash deploy/scripts/backup-db.sh
```

### Backup Storage

Backups are stored in `deploy/backups/`:

- `daily/` - Last 7 days
- `weekly/` - Last 4 weeks
- `monthly/` - Last 3 months

### Restore Database

#### Docker

```bash
# List backups
ls -lh deploy/backups/daily/

# Restore from backup
gunzip < deploy/backups/daily/inventory_db_2024-12-15.sql.gz | \
  docker exec -i inventory-postgres psql -U inventory -d inventory_db
```

#### PM2/Traditional

```bash
# Restore
gunzip < deploy/backups/daily/inventory_db_2024-12-15.sql.gz | \
  sudo -u postgres psql inventory_db
```

### Remote Backup Storage

Configure S3 or similar in backup scripts:

```bash
# Uncomment S3 upload section in backup-db-docker.sh
# Configure AWS credentials
aws configure

# Backups will automatically upload to S3
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres  # Docker
systemctl status postgresql  # PM2

# Check database logs
docker logs inventory-postgres  # Docker
sudo tail -f /var/log/postgresql/postgresql-15-main.log  # PM2

# Test connection
psql -U inventory -d inventory_db -h localhost
```

#### 2. API Not Responding

```bash
# Check API logs
docker logs inventory-api  # Docker
pm2 logs inventory-api  # PM2

# Check if port is listening
netstat -tulpn | grep 3001

# Restart API
docker-compose restart api  # Docker
pm2 restart inventory-api  # PM2
```

#### 3. Nginx 502 Bad Gateway

```bash
# Check nginx error logs
tail -f /var/log/nginx/error.log

# Check if API is running
curl http://localhost:3001/health

# Test nginx config
nginx -t

# Restart nginx
systemctl restart nginx
```

#### 4. Out of Memory

```bash
# Check memory usage
free -h
docker stats  # For Docker

# Increase swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 5. Disk Space Full

```bash
# Check disk usage
df -h

# Clean Docker resources
docker system prune -a

# Clean old logs
find /var/www/inventory/logs -name "*.log" -mtime +30 -delete

# Clean old backups
bash deploy/scripts/backup-db-docker.sh  # Runs cleanup automatically
```

---

## Rollback Procedures

### Automated Rollback

```bash
# List available backups
bash deploy/scripts/rollback.sh

# Select backup to restore
# Script will:
# 1. Create pre-rollback backup
# 2. Stop services
# 3. Restore database
# 4. Rollback code (if git info available)
# 5. Restart services
```

### Manual Rollback

#### Docker Deployment

```bash
# Stop services
docker-compose -f deploy/docker-compose.production.yml down

# Restore database
gunzip < deploy/backups/backup_TIMESTAMP_database.sql.gz | \
  docker exec -i inventory-postgres psql -U inventory -d inventory_db

# Rollback code
git checkout COMMIT_HASH

# Rebuild and restart
docker-compose -f deploy/docker-compose.production.yml up -d --build
```

#### PM2 Deployment

```bash
# Stop services
pm2 stop ecosystem.config.js

# Restore database
gunzip < deploy/backups/backup_TIMESTAMP_database.sql.gz | \
  sudo -u postgres psql inventory_db

# Rollback code
git checkout COMMIT_HASH

# Rebuild
npm run build

# Restart
pm2 restart ecosystem.config.js
```

---

## CI/CD with GitHub Actions

### Setup GitHub Secrets

Add these secrets in GitHub repository settings:

```
DOCKER_USERNAME          - Docker Hub username
DOCKER_PASSWORD          - Docker Hub password/token
STAGING_SSH_KEY          - SSH private key for staging server
STAGING_HOST             - Staging server IP/hostname
STAGING_USER             - SSH username for staging
PRODUCTION_SSH_KEY       - SSH private key for production server
PRODUCTION_HOST          - Production server IP/hostname
PRODUCTION_USER          - SSH username for production
SLACK_WEBHOOK_URL        - Slack webhook for notifications
```

### Deployment Workflow

The workflow (`.github/workflows/deploy.yml`) automatically:

1. **On Pull Request**: Run tests and checks
2. **On Push to `staging`**: Deploy to staging environment
3. **On Push to `main`**: Deploy to production environment

### Manual Deployment Trigger

```bash
# Go to GitHub Actions tab
# Select "Deploy" workflow
# Click "Run workflow"
# Choose environment (staging/production)
```

### Deployment Process

1. **Test Phase**: Lint, type check, unit tests, E2E tests
2. **Build Phase**: Build Docker images, push to registry
3. **Deploy Phase**:
   - SSH into server
   - Pull latest code
   - Run deployment script
   - Run health checks
4. **Verify Phase**: Check endpoints, run smoke tests
5. **Notify Phase**: Send Slack notification

---

## Security Best Practices

### 1. Environment Variables

- Never commit `.env` files
- Use strong, unique secrets
- Rotate secrets regularly
- Use separate secrets for each environment

### 2. Database Security

```sql
-- Restrict database user permissions
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO inventory_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO inventory_user;
```

### 3. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22     # SSH
sudo ufw allow 80     # HTTP
sudo ufw allow 443    # HTTPS
sudo ufw enable
```

### 4. SSL/TLS

- Use strong ciphers
- Enable HSTS
- Use TLS 1.2+
- Implement certificate pinning (optional)

### 5. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node packages
npm audit fix

# Update Docker images
docker-compose pull
```

---

## Performance Optimization

### 1. Database Optimization

```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_items_client_id ON items(client_id);
CREATE INDEX idx_items_created_at ON items(created_at);

-- Analyze tables
ANALYZE items;
```

### 2. Redis Caching

Configure cache TTL in `.env`:

```bash
CACHE_TTL=3600  # 1 hour
```

### 3. Nginx Caching

Already configured in `deploy/nginx/inventory.conf`:

- Static assets: 1 year cache
- API responses: No cache
- Gzip compression enabled

### 4. PM2 Cluster Mode

Utilize all CPU cores:

```javascript
// In ecosystem.config.js
instances: "max";
```

### 5. Load Balancing

For high traffic, use nginx upstream:

```nginx
upstream api_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}
```

---

## Scaling Strategies

### Horizontal Scaling (Docker)

```bash
# Scale API service
docker-compose -f deploy/docker-compose.production.yml up -d --scale api=3
```

### Vertical Scaling

Increase server resources:

- CPU: 4-8 cores
- RAM: 16-32 GB
- Storage: SSD with 100+ GB

### Database Scaling

- **Read Replicas**: For read-heavy workloads
- **Connection Pooling**: Already configured in Prisma
- **Query Optimization**: Use database query analyzer

---

## Monitoring Checklist

Daily:

- [ ] Check application logs for errors
- [ ] Verify all services are running
- [ ] Check disk space usage
- [ ] Review API response times

Weekly:

- [ ] Review backup integrity
- [ ] Check SSL certificate expiration
- [ ] Update system packages
- [ ] Review security logs

Monthly:

- [ ] Performance analysis
- [ ] Database optimization
- [ ] Rotate secrets
- [ ] Disaster recovery drill

---

## Support & Maintenance

### Getting Help

1. Check logs for error messages
2. Review this deployment guide
3. Check GitHub issues
4. Contact development team

### Maintenance Windows

Recommended maintenance schedule:

- **Weekly**: Minor updates, during low-traffic hours
- **Monthly**: Major updates, planned downtime
- **Quarterly**: Security audits, disaster recovery tests

---

## Appendix

### Useful Commands Reference

```bash
# Health Checks
bash deploy/scripts/health-check.sh
curl http://localhost:3001/health

# Deployment
bash deploy/scripts/deploy-docker.sh production
bash deploy/scripts/deploy.sh  # PM2 deployment

# Backups
bash deploy/scripts/backup-db-docker.sh
bash deploy/scripts/backup-db.sh

# Rollback
bash deploy/scripts/rollback.sh

# Logs
pm2 logs inventory-api
docker-compose logs -f api
tail -f /var/log/nginx/error.log

# Database
npm run db:push
npm run db:migrate
npm run db:studio

# Service Management
pm2 restart inventory-api
docker-compose restart api
systemctl restart nginx
```

### Directory Structure

```
/var/www/inventory/
├── apps/
│   ├── api/          # API server
│   ├── web/          # Admin dashboard
│   ├── portal/       # Client portal
│   └── ml-analytics/ # ML service
├── deploy/
│   ├── nginx/        # Nginx configs
│   ├── scripts/      # Deployment scripts
│   ├── backups/      # Database backups
│   └── .env          # Environment config
├── logs/             # Application logs
├── uploads/          # Uploaded files
└── admin/            # Deployed web files
└── portal/           # Deployed portal files
```

---

**Last Updated**: December 2024
**Platform Version**: 1.0.0
**Maintained by**: Aerial Shots Media Development Team
