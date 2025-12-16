# Deployment Files Index

Quick reference guide to all deployment configuration files and their purposes.

## Start Here

| File                                                           | Purpose                    | When to Use                            |
| -------------------------------------------------------------- | -------------------------- | -------------------------------------- |
| **[QUICK-START.md](QUICK-START.md)**                           | Fast deployment guide      | First-time deployment, quick reference |
| **[README.md](README.md)**                                     | Deploy directory overview  | Understanding structure and options    |
| **[DEPLOYMENT-COMPREHENSIVE.md](DEPLOYMENT-COMPREHENSIVE.md)** | Complete deployment manual | Detailed deployment procedures         |

## Configuration Files

### Environment Configuration

| File                      | Purpose                         | Environment     |
| ------------------------- | ------------------------------- | --------------- |
| `.env.production.example` | Production environment template | Production      |
| `.env.staging.example`    | Staging environment template    | Staging/Testing |

**Next Step**: Copy to `.env` and configure for your environment

### Docker Configuration

| File                            | Purpose               | Environment          |
| ------------------------------- | --------------------- | -------------------- |
| `docker-compose.production.yml` | Full production stack | Production (Docker)  |
| `docker-compose.dev.yml`        | Development services  | Development (Docker) |

**Services**: PostgreSQL, Redis, API, ML Analytics, Nginx

### Server Configuration

| File                          | Purpose                   | Type              |
| ----------------------------- | ------------------------- | ----------------- |
| `ecosystem.config.js`         | PM2 process management    | PM2 Deployment    |
| `nginx/inventory.conf`        | Production Nginx config   | Server Deployment |
| `nginx/inventory-docker.conf` | Docker Nginx config       | Docker Deployment |
| `nginx/inventory-server.conf` | Alternative server config | Server Deployment |

## Deployment Scripts

### Main Deployment

| Script                     | Purpose            | Method          |
| -------------------------- | ------------------ | --------------- |
| `scripts/deploy-docker.sh` | Deploy with Docker | Docker          |
| `scripts/deploy.sh`        | Deploy with PM2    | PM2/Traditional |

### Server Setup

| Script                    | Purpose           | When to Use             |
| ------------------------- | ----------------- | ----------------------- |
| `scripts/setup-server.sh` | Initialize server | First-time server setup |
| `scripts/setup-ssl.sh`    | Configure SSL/TLS | After DNS setup         |

### Operations

| Script                        | Purpose                  | Frequency             |
| ----------------------------- | ------------------------ | --------------------- |
| `scripts/backup-db-docker.sh` | Backup database (Docker) | Daily (automated)     |
| `scripts/backup-db.sh`        | Backup database (PM2)    | Daily (automated)     |
| `scripts/health-check.sh`     | System health check      | As needed / Automated |
| `scripts/rollback.sh`         | Rollback deployment      | When deployment fails |

## CI/CD

| File                              | Purpose                  | Trigger                  |
| --------------------------------- | ------------------------ | ------------------------ |
| `../.github/workflows/deploy.yml` | Automated CI/CD pipeline | Git push to main/staging |

## Documentation

| File                            | Description                        |
| ------------------------------- | ---------------------------------- |
| **QUICK-START.md**              | 5-10 minute deployment guides      |
| **README.md**                   | Deploy directory documentation     |
| **DEPLOYMENT-COMPREHENSIVE.md** | Complete 30-page deployment manual |
| **DEPLOYMENT-FILES-SUMMARY.md** | Detailed file descriptions         |
| **INDEX.md**                    | This file - quick navigation       |
| **DNS-SETUP.md**                | DNS configuration guide            |
| **DEPLOYMENT.md**               | Original deployment guide          |

## Common Workflows

### First-Time Production Deployment

1. Read: `QUICK-START.md` (10-minute guide)
2. Configure: `.env.production.example` → `.env`
3. Run: `scripts/deploy-docker.sh production`
4. Verify: `scripts/health-check.sh`

### Development Setup

1. Read: `QUICK-START.md` (development section)
2. Start: `docker-compose -f docker-compose.dev.yml up -d`
3. Develop: `npm run dev:api`, `npm run dev:web`, etc.

### Updating Production

1. Backup: `scripts/backup-db-docker.sh` (or automated)
2. Deploy: `scripts/deploy-docker.sh production`
3. Verify: `scripts/health-check.sh`
4. If issues: `scripts/rollback.sh`

### Troubleshooting

1. Check: `scripts/health-check.sh`
2. Review: Application logs
3. Reference: `DEPLOYMENT-COMPREHENSIVE.md` (Troubleshooting section)
4. If needed: `scripts/rollback.sh`

## File Locations

```
fulfillment-ops-dashboard/
│
├── .github/
│   └── workflows/
│       └── deploy.yml                   # CI/CD pipeline
│
└── deploy/                              # THIS DIRECTORY
    │
    ├── Documentation (6 files)
    │   ├── INDEX.md                     # This file
    │   ├── QUICK-START.md               # Fast deployment
    │   ├── README.md                    # Directory overview
    │   ├── DEPLOYMENT-COMPREHENSIVE.md  # Complete manual
    │   ├── DEPLOYMENT-FILES-SUMMARY.md  # File descriptions
    │   ├── DEPLOYMENT.md                # Original guide
    │   └── DNS-SETUP.md                 # DNS configuration
    │
    ├── Environment (2 files)
    │   ├── .env.production.example      # Production template
    │   └── .env.staging.example         # Staging template
    │
    ├── Docker (2 files)
    │   ├── docker-compose.production.yml
    │   └── docker-compose.dev.yml
    │
    ├── PM2 (1 file)
    │   └── ecosystem.config.js
    │
    ├── nginx/ (3 files)
    │   ├── inventory.conf
    │   ├── inventory-docker.conf
    │   └── inventory-server.conf
    │
    └── scripts/ (8 files)
        ├── deploy-docker.sh
        ├── deploy.sh
        ├── setup-server.sh
        ├── setup-ssl.sh
        ├── backup-db-docker.sh
        ├── backup-db.sh
        ├── rollback.sh
        └── health-check.sh
```

## Quick Command Reference

### Docker Deployment

```bash
# Deploy
bash deploy/scripts/deploy-docker.sh production

# Health check
bash deploy/scripts/health-check.sh

# Backup
bash deploy/scripts/backup-db-docker.sh

# Rollback
bash deploy/scripts/rollback.sh

# Logs
docker-compose -f deploy/docker-compose.production.yml logs -f api
```

### PM2 Deployment

```bash
# Deploy
bash deploy/scripts/deploy.sh

# Health check
bash deploy/scripts/health-check.sh

# Backup
bash deploy/scripts/backup-db.sh

# Rollback
bash deploy/scripts/rollback.sh

# Logs
pm2 logs inventory-api
```

## Need Help?

**Quick Issues**: Check `QUICK-START.md` troubleshooting section
**Detailed Help**: See `DEPLOYMENT-COMPREHENSIVE.md` troubleshooting chapter
**File Details**: Review `DEPLOYMENT-FILES-SUMMARY.md`
**Structure**: Read `README.md`

## File Statistics

- **Total Files**: 22 deployment configuration files
- **Documentation**: 6 guides (70+ pages combined)
- **Scripts**: 8 automation scripts
- **Configurations**: 8 config files
- **Total Lines**: 3,500+ lines of configuration and documentation

## Version Information

- **Created**: December 15, 2024
- **Platform Version**: 1.0.0
- **Last Updated**: December 15, 2024
- **Maintained By**: Aerial Shots Media Development Team

---

**Navigation**: [Quick Start](QUICK-START.md) | [Full Guide](DEPLOYMENT-COMPREHENSIVE.md) | [README](README.md) | [Files Summary](DEPLOYMENT-FILES-SUMMARY.md)
