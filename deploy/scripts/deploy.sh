#!/bin/bash
# =============================================================================
# Deployment Script for Inventory Intelligence Platform
# Run this script to deploy/update the application
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_DIR="/var/www/inventory"
REPO_URL="https://github.com/yourusername/fulfillment-ops-dashboard.git"  # Update this
BRANCH="main"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Deploying Inventory Intelligence Platform${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Timestamp: $(date)"

# =============================================================================
# Pre-deployment checks
# =============================================================================
echo -e "\n${YELLOW}[1/9] Pre-deployment checks...${NC}"

# Check if .env exists
if [ ! -f "${APP_DIR}/.env" ]; then
    echo -e "${RED}ERROR: ${APP_DIR}/.env not found!${NC}"
    echo -e "Please copy deploy/production.env to ${APP_DIR}/.env and configure it."
    exit 1
fi

# Check services
systemctl is-active --quiet postgresql || { echo -e "${RED}PostgreSQL is not running!${NC}"; exit 1; }
systemctl is-active --quiet redis || { echo -e "${RED}Redis is not running!${NC}"; exit 1; }
systemctl is-active --quiet nginx || { echo -e "${RED}Nginx is not running!${NC}"; exit 1; }

echo -e "${GREEN}All services running.${NC}"

# =============================================================================
# Pull latest code
# =============================================================================
echo -e "\n${YELLOW}[2/9] Pulling latest code...${NC}"

cd ${APP_DIR}

if [ -d ".git" ]; then
    git fetch origin
    git reset --hard origin/${BRANCH}
else
    echo -e "${YELLOW}Cloning repository...${NC}"
    cd /var/www
    rm -rf inventory
    git clone ${REPO_URL} inventory
    cd inventory
fi

echo -e "${GREEN}Code updated to latest ${BRANCH}.${NC}"

# =============================================================================
# Install dependencies
# =============================================================================
echo -e "\n${YELLOW}[3/9] Installing dependencies...${NC}"
npm ci --production=false

echo -e "${GREEN}Dependencies installed.${NC}"

# =============================================================================
# Install Python dependencies
# =============================================================================
echo -e "\n${YELLOW}[4/9] Setting up Python environment...${NC}"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}Installing Python...${NC}"
    apt-get update && apt-get install -y python3 python3-pip python3-venv
fi

# Set up Python virtual environment for importer
cd ${APP_DIR}/apps/python-importer
if [ ! -d "venv" ]; then
    echo -e "${BLUE}Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

echo -e "${BLUE}Installing Python dependencies...${NC}"
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

cd ${APP_DIR}
echo -e "${GREEN}Python environment ready.${NC}"

# =============================================================================
# Build applications
# =============================================================================
echo -e "\n${YELLOW}[5/9] Building applications...${NC}"

# Generate Prisma client
echo -e "${BLUE}Generating Prisma client...${NC}"
npm run db:generate

# Build all apps
echo -e "${BLUE}Building API...${NC}"
npm run build:api

echo -e "${BLUE}Building Admin Dashboard...${NC}"
npm run build:web

echo -e "${BLUE}Building Client Portal...${NC}"
npm run build:portal

echo -e "${GREEN}All builds complete.${NC}"

# =============================================================================
# Run database migrations
# =============================================================================
echo -e "\n${YELLOW}[6/9] Running database migrations...${NC}"
npm run db:push

echo -e "${GREEN}Database schema synced.${NC}"

# =============================================================================
# Run data normalization scripts
# =============================================================================
echo -e "\n${YELLOW}[6.5/9] Running data normalization...${NC}"

# Normalize item_type values (lowercase: evergreen, event, completed)
echo -e "${BLUE}Normalizing item_type values...${NC}"
npx tsx apps/api/scripts/normalize-item-types.ts

# Clear Python cache
echo -e "${BLUE}Clearing Python cache...${NC}"
rm -rf apps/python-importer/__pycache__

echo -e "${GREEN}Data normalization complete.${NC}"

# =============================================================================
# Deploy static files
# =============================================================================
echo -e "\n${YELLOW}[7/9] Deploying static files...${NC}"

# Copy frontend builds to Nginx directories
rm -rf ${APP_DIR}/admin/*
rm -rf ${APP_DIR}/portal/*

cp -r apps/web/dist/* ${APP_DIR}/admin/
cp -r apps/portal/dist/* ${APP_DIR}/portal/

# Set permissions
chown -R www-data:www-data ${APP_DIR}/admin
chown -R www-data:www-data ${APP_DIR}/portal

echo -e "${GREEN}Static files deployed.${NC}"

# =============================================================================
# Restart API with PM2
# =============================================================================
echo -e "\n${YELLOW}[8/9] Restarting API server...${NC}"

# Create PM2 ecosystem file
cat > ${APP_DIR}/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'inventory-api',
    script: 'apps/api/dist/index.js',
    cwd: '/var/www/inventory',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    env_file: '/var/www/inventory/.env',
    error_file: '/var/www/inventory/logs/api-error.log',
    out_file: '/var/www/inventory/logs/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '500M',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 4000
  }]
};
EOF

# Restart or start PM2
if pm2 describe inventory-api > /dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
else
    pm2 start ecosystem.config.js --env production
fi

# Save PM2 process list
pm2 save

echo -e "${GREEN}API server restarted.${NC}"

# =============================================================================
# Verify deployment
# =============================================================================
echo -e "\n${YELLOW}[8.5/9] Verifying deployment...${NC}"

# Wait for API to start
sleep 5

# Check API health
API_HEALTH=$(curl -s http://localhost:3001/health | jq -r '.status' 2>/dev/null || echo "error")
if [ "$API_HEALTH" = "ok" ]; then
    echo -e "${GREEN}✓ API health check passed${NC}"
else
    echo -e "${RED}✗ API health check failed${NC}"
    pm2 logs inventory-api --lines 20
    exit 1
fi

# Check Nginx config
nginx -t && echo -e "${GREEN}✓ Nginx config valid${NC}"

# Reload Nginx
systemctl reload nginx
echo -e "${GREEN}✓ Nginx reloaded${NC}"

# =============================================================================
# Run Post-Deploy Diagnostics
# =============================================================================
echo -e "\n${YELLOW}[9/9] Running post-deploy diagnostics...${NC}"

# Create logs directory if it doesn't exist
mkdir -p ${APP_DIR}/logs

# Generate timestamped diagnostic filename
DIAGNOSTIC_FILE="${APP_DIR}/logs/diagnostic-$(date +%Y%m%d_%H%M%S).txt"

# Run full diagnostic
echo -e "${BLUE}Running comprehensive diagnostic checks...${NC}"
npx tsx apps/api/scripts/audit/full-diagnostic.ts 2>&1 | tee "${DIAGNOSTIC_FILE}"

# Parse diagnostic results
FAILURES=$(grep -c "❌" "${DIAGNOSTIC_FILE}" 2>/dev/null || echo "0")
WARNINGS=$(grep -c "⚠️" "${DIAGNOSTIC_FILE}" 2>/dev/null || echo "0")
PASSES=$(grep -c "✓" "${DIAGNOSTIC_FILE}" 2>/dev/null || echo "0")

echo -e ""
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}DIAGNOSTIC SUMMARY${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}✓ Passed: ${PASSES}${NC}"
echo -e "${YELLOW}⚠️  Warnings: ${WARNINGS}${NC}"
echo -e "${RED}❌ Failures: ${FAILURES}${NC}"
echo -e "${BLUE}================================${NC}"

if [ "$FAILURES" -gt 0 ]; then
    echo -e "${RED}⚠️  Warning: ${FAILURES} diagnostic failure(s) detected!${NC}"
    echo -e "${YELLOW}Review diagnostic report: ${DIAGNOSTIC_FILE}${NC}"
    # Don't fail deployment, but warn
else
    echo -e "${GREEN}✓ All diagnostics passed${NC}"
fi

# Keep only last 10 diagnostic reports
ls -t ${APP_DIR}/logs/diagnostic-*.txt 2>/dev/null | tail -n +11 | xargs -r rm

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e ""
echo -e "URLs:"
echo -e "  Admin:  https://admin.yourtechassist.us"
echo -e "  Portal: https://portal.yourtechassist.us"
echo -e "  API:    https://api.yourtechassist.us"
echo -e ""
echo -e "Commands:"
echo -e "  View logs:       ${YELLOW}pm2 logs inventory-api${NC}"
echo -e "  Status:          ${YELLOW}pm2 status${NC}"
echo -e "  Restart API:     ${YELLOW}pm2 restart inventory-api${NC}"
echo -e "  Last diagnostic: ${YELLOW}cat ${DIAGNOSTIC_FILE}${NC}"
echo -e ""
echo -e "Deployed at: $(date)"
