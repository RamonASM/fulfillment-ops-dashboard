# Quick Start Deployment Guide

## 5-Minute Docker Deployment

### Prerequisites

- Docker & Docker Compose installed
- 4GB RAM minimum
- 20GB disk space

### Steps

```bash
# 1. Clone repository
git clone <your-repo-url>
cd fulfillment-ops-dashboard

# 2. Configure environment
cd deploy
cp .env.production.example .env

# 3. Generate secrets (run each command, copy output to .env)
openssl rand -base64 32  # JWT_SECRET
openssl rand -base64 32  # JWT_REFRESH_SECRET
openssl rand -base64 32  # SESSION_SECRET

# 4. Edit .env (set DB_PASSWORD and paste secrets)
nano .env

# 5. Deploy
bash scripts/deploy-docker.sh production

# 6. Verify
bash scripts/health-check.sh
```

### Access

- Admin Dashboard: http://localhost
- Client Portal: http://localhost:8080
- API: http://localhost:3001

Default credentials:

- Admin: `sarah.chen@inventoryiq.com` / `demo1234`
- Client: `john.doe@acmecorp.com` / `client1234`

---

## 10-Minute Production Server Deployment

### Prerequisites

- Ubuntu 22.04 server
- Domain name pointing to server
- Root/sudo access

### Steps

```bash
# 1. Clone to server
ssh root@your-server-ip
git clone <your-repo-url> /var/www/inventory
cd /var/www/inventory

# 2. Run server setup
cd deploy/scripts
chmod +x *.sh
sudo bash setup-server.sh

# 3. Configure environment
cd /var/www/inventory/deploy
cp .env.production.example /var/www/inventory/.env
nano /var/www/inventory/.env

# Update these in .env:
# - DB_PASSWORD (generate: openssl rand -base64 16)
# - JWT_SECRET (generate: openssl rand -base64 32)
# - JWT_REFRESH_SECRET (generate: openssl rand -base64 32)
# - SESSION_SECRET (generate: openssl rand -base64 32)
# - Update URLs to your domain

# 4. Update database password
sudo -u postgres psql -c "ALTER USER inventory_user WITH PASSWORD 'your_password_from_env';"

# 5. Setup SSL
sudo bash setup-ssl.sh

# 6. Configure Nginx
sudo cp ../nginx/inventory.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/inventory.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 7. Deploy application
bash deploy.sh

# 8. Seed database (first time only)
cd /var/www/inventory
npm run db:seed
```

### Access

- Admin: https://admin.yourdomain.com
- Portal: https://portal.yourdomain.com
- API: https://api.yourdomain.com

---

## Development Setup

```bash
# 1. Clone repository
git clone <your-repo-url>
cd fulfillment-ops-dashboard

# 2. Start database services
docker-compose -f deploy/docker-compose.dev.yml up -d

# 3. Configure API
cp apps/api/.env.example apps/api/.env

# 4. Install dependencies
npm ci

# 5. Run migrations
npm run db:push

# 6. Seed database
npm run db:seed

# 7. Start development servers
npm run dev:api    # Terminal 1
npm run dev:web    # Terminal 2
npm run dev:portal # Terminal 3
```

Access:

- Admin: http://localhost:5173
- Portal: http://localhost:5174
- API: http://localhost:3001

---

## Common Commands

### Docker Deployment

```bash
# Deploy
bash deploy/scripts/deploy-docker.sh production

# View logs
docker-compose -f deploy/docker-compose.production.yml logs -f api

# Restart service
docker-compose -f deploy/docker-compose.production.yml restart api

# Backup database
bash deploy/scripts/backup-db-docker.sh

# Health check
bash deploy/scripts/health-check.sh

# Rollback
bash deploy/scripts/rollback.sh
```

### PM2 Deployment

```bash
# Deploy
cd /var/www/inventory/deploy/scripts
bash deploy.sh

# View logs
pm2 logs inventory-api

# Restart
pm2 restart inventory-api

# Status
pm2 status

# Backup database
bash deploy/scripts/backup-db.sh

# Health check
bash deploy/scripts/health-check.sh
```

---

## Troubleshooting

### Database Connection Error

```bash
# Docker
docker ps | grep postgres
docker logs inventory-postgres

# PM2
systemctl status postgresql
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

### API Not Starting

```bash
# Check logs
docker logs inventory-api  # Docker
pm2 logs inventory-api     # PM2

# Check port
netstat -tulpn | grep 3001
```

### Nginx 502 Error

```bash
# Check API is running
curl http://localhost:3001/health

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Test nginx config
sudo nginx -t
```

### Out of Disk Space

```bash
# Check usage
df -h

# Clean Docker
docker system prune -a

# Clean logs
find /var/www/inventory/logs -name "*.log" -mtime +7 -delete
```

---

## Security Checklist

Before going live:

- [ ] Generate strong, unique secrets
- [ ] Set strong database password
- [ ] Enable HTTPS (SSL certificates)
- [ ] Configure firewall (UFW)
- [ ] Set COOKIE_SECURE=true
- [ ] Configure CORS with specific domains
- [ ] Enable rate limiting
- [ ] Set up automated backups
- [ ] Change default user passwords
- [ ] Review nginx security headers

---

## Need More Help?

- **Full Guide**: See `DEPLOYMENT-COMPREHENSIVE.md`
- **Deploy Directory**: See `README.md`
- **Project Info**: See `../README.md`
- **Troubleshooting**: Check logs first, then run health-check.sh

---

**Quick Links:**

- Health Check: `bash deploy/scripts/health-check.sh`
- Backup: `bash deploy/scripts/backup-db-docker.sh`
- Rollback: `bash deploy/scripts/rollback.sh`
- Logs: `docker-compose logs -f api` or `pm2 logs inventory-api`
