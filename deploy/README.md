# Deployment Configuration

This directory contains all deployment configurations, scripts, and documentation for the Inventory Intelligence Platform.

## Quick Start

### Development

```bash
# Start local development environment with Docker
docker-compose -f docker-compose.dev.yml up -d
```

### Production Deployment

```bash
# 1. Configure environment
cp .env.production.example .env
nano .env  # Edit with your settings

# 2. Deploy with Docker
bash scripts/deploy-docker.sh production

# 3. Verify health
bash scripts/health-check.sh
```

## Directory Structure

```
deploy/
├── README.md                           # This file
├── DEPLOYMENT-COMPREHENSIVE.md         # Complete deployment guide
├── .env.production.example             # Production environment template
├── .env.staging.example                # Staging environment template
├── docker-compose.production.yml       # Docker Compose for production
├── docker-compose.dev.yml              # Docker Compose for development
├── ecosystem.config.js                 # PM2 process configuration
├── nginx/                              # Nginx configurations
│   ├── inventory.conf                  # Production server config
│   ├── inventory-server.conf           # Alternative server config
│   └── inventory-docker.conf           # Docker container config
├── scripts/                            # Deployment scripts
│   ├── deploy.sh                       # PM2 deployment script
│   ├── deploy-docker.sh                # Docker deployment script
│   ├── setup-server.sh                 # Server initialization
│   ├── setup-ssl.sh                    # SSL certificate setup
│   ├── backup-db.sh                    # PM2 database backup
│   ├── backup-db-docker.sh             # Docker database backup
│   ├── rollback.sh                     # Rollback utility
│   └── health-check.sh                 # Health check utility
└── backups/                            # Database backups (created automatically)
    ├── daily/
    ├── weekly/
    └── monthly/
```

## Available Deployment Methods

### 1. Docker Deployment (Recommended)

**Pros:**

- Easy setup and consistent environments
- Built-in service orchestration
- Simplified scaling
- Isolated services

**Use for:**

- Development environments
- Small to medium production deployments
- Quick prototyping

**Files:**

- `docker-compose.production.yml` - Production services
- `docker-compose.dev.yml` - Development services
- `scripts/deploy-docker.sh` - Deployment automation
- `nginx/inventory-docker.conf` - Nginx config for Docker

### 2. PM2 + Nginx (Traditional)

**Pros:**

- More control over individual services
- Better for existing server infrastructure
- Lower resource overhead
- Easier debugging

**Use for:**

- Traditional VPS hosting
- Shared infrastructure
- Custom server setups

**Files:**

- `ecosystem.config.js` - PM2 process management
- `scripts/deploy.sh` - Traditional deployment
- `nginx/inventory.conf` - Production Nginx config

### 3. CI/CD with GitHub Actions

**Pros:**

- Automated testing and deployment
- Consistent deployment process
- Version control integration
- Rollback capabilities

**Use for:**

- Production workflows
- Team environments
- Continuous delivery

**Files:**

- `../.github/workflows/deploy.yml` - CI/CD pipeline

## Environment Files

### `.env.production.example`

Complete production environment template with all configuration options:

- Database connections
- JWT secrets
- API endpoints
- Email/SMTP settings
- AI integrations
- Monitoring configuration

**Setup:**

```bash
cp .env.production.example .env
# Generate secrets
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 32  # For JWT_REFRESH_SECRET
openssl rand -base64 32  # For SESSION_SECRET
# Edit .env with your values
```

### `.env.staging.example`

Staging environment configuration with test-friendly settings.

## Deployment Scripts

### Core Scripts

#### `deploy-docker.sh`

Docker-based deployment with zero-downtime updates.

```bash
bash scripts/deploy-docker.sh [production|staging]
```

Features:

- Pre-deployment checks
- Automatic backups
- Health monitoring
- Rollback on failure

#### `deploy.sh`

Traditional PM2-based deployment.

```bash
bash scripts/deploy.sh
```

Features:

- Pull latest code
- Install dependencies
- Build applications
- Database migrations
- PM2 restart

#### `health-check.sh`

Comprehensive health check across all services.

```bash
bash scripts/health-check.sh
```

Checks:

- System resources (CPU, memory, disk)
- Container/process status
- Database connectivity
- HTTP endpoints
- API response times
- Security headers

#### `rollback.sh`

Rollback to previous deployment state.

```bash
bash scripts/rollback.sh [backup_timestamp]
```

Features:

- Interactive backup selection
- Pre-rollback backup
- Database restoration
- Code rollback (if git)
- Service restart

#### `backup-db-docker.sh` / `backup-db.sh`

Database backup utilities.

```bash
# Docker
bash scripts/backup-db-docker.sh

# PM2/Traditional
bash scripts/backup-db.sh
```

Features:

- Automated daily/weekly/monthly backups
- Compression
- Retention policy (7 days, 4 weeks, 3 months)
- Integrity verification

### Setup Scripts

#### `setup-server.sh`

Initialize a fresh server with all dependencies.

```bash
sudo bash scripts/setup-server.sh
```

Installs:

- Node.js 20.x
- PostgreSQL 15
- Redis 7
- Nginx
- PM2
- Python 3.11
- Firewall configuration

#### `setup-ssl.sh`

Configure SSL certificates with Let's Encrypt.

```bash
sudo bash scripts/setup-ssl.sh
```

Features:

- Automatic certificate generation
- Nginx configuration
- Auto-renewal setup

## Docker Compose Files

### `docker-compose.production.yml`

Full production stack with all services:

Services:

- PostgreSQL with health checks
- Redis with persistence
- API server with clustering
- ML Analytics service
- Nginx web server
- Automated backup service

Usage:

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f [service]

# Restart service
docker-compose -f docker-compose.production.yml restart [service]

# Stop all
docker-compose -f docker-compose.production.yml down

# Scale API
docker-compose -f docker-compose.production.yml up -d --scale api=3
```

### `docker-compose.dev.yml`

Lightweight development environment:

Services:

- PostgreSQL (dev database)
- Redis
- Optional ML Analytics

Usage:

```bash
# Start dependencies
docker-compose -f docker-compose.dev.yml up -d

# Run app locally
npm run dev:api
npm run dev:web
npm run dev:portal
```

## Nginx Configurations

### `inventory.conf`

Production server configuration with:

- SSL/TLS termination
- Multiple subdomain routing
- Rate limiting
- Security headers
- WebSocket support
- Static file caching

### `inventory-docker.conf`

Docker-specific configuration:

- Service discovery
- Internal routing
- Development-friendly settings

## PM2 Configuration

### `ecosystem.config.js`

PM2 process management:

Apps:

- `inventory-api` - Main API server (cluster mode)
- `inventory-worker` - Background jobs
- `inventory-ml` - ML Analytics service

Features:

- Auto-restart on failure
- Memory limits
- Log rotation
- Cluster mode for scaling

Usage:

```bash
# Start all
pm2 start ecosystem.config.js --env production

# Start specific app
pm2 start ecosystem.config.js --only inventory-api

# Monitor
pm2 monit

# Logs
pm2 logs inventory-api
```

## Common Tasks

### Deploy Updates

```bash
# Docker
bash scripts/deploy-docker.sh production

# PM2
cd /var/www/inventory
git pull
npm run build
pm2 reload ecosystem.config.js
```

### View Logs

```bash
# Docker
docker-compose -f docker-compose.production.yml logs -f api

# PM2
pm2 logs inventory-api

# Nginx
tail -f /var/log/nginx/error.log
```

### Database Operations

```bash
# Backup
bash scripts/backup-db-docker.sh

# Restore
gunzip < backups/daily/inventory_db_2024-12-15.sql.gz | \
  docker exec -i inventory-postgres psql -U inventory -d inventory_db

# Migrations
docker-compose exec api npm run db:push
```

### Troubleshooting

```bash
# Check health
bash scripts/health-check.sh

# Check service status
docker-compose ps  # Docker
pm2 status  # PM2

# Restart services
docker-compose restart api  # Docker
pm2 restart inventory-api  # PM2
```

## Security Checklist

Before production deployment:

- [ ] Generate strong, unique secrets for JWT
- [ ] Configure strong database password
- [ ] Set `COOKIE_SECURE=true` for HTTPS
- [ ] Configure CORS with specific domains
- [ ] Enable rate limiting
- [ ] Set up SSL certificates
- [ ] Configure firewall (UFW)
- [ ] Set up automated backups
- [ ] Enable monitoring/logging
- [ ] Review and test rollback procedure

## Monitoring

### Health Checks

Automated health monitoring:

```bash
# Run comprehensive check
bash scripts/health-check.sh

# Setup cron for automated checks
crontab -e
# Add: */5 * * * * /var/www/inventory/deploy/scripts/health-check.sh
```

### Logs

Log locations:

- **Application**: `/var/www/inventory/logs/`
- **Nginx**: `/var/log/nginx/`
- **Docker**: `docker-compose logs`
- **PM2**: `~/.pm2/logs/`

### Backups

Automated backup schedule:

```bash
# Add to crontab
crontab -e
# Daily backup at 2 AM
0 2 * * * /var/www/inventory/deploy/scripts/backup-db-docker.sh
```

## Support

For detailed deployment instructions, see:

- **DEPLOYMENT-COMPREHENSIVE.md** - Complete deployment guide
- **../README.md** - Project documentation

For issues:

- Check logs first
- Run health checks
- Review troubleshooting section
- Contact development team

---

**Last Updated**: December 2024
**Platform Version**: 1.0.0
