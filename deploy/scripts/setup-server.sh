#!/bin/bash
# =============================================================================
# Server Setup Script for Inventory Intelligence Platform
# Run this script on a fresh Ubuntu 22.04 server (DigitalOcean, Linode, etc.)
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Inventory Intelligence Platform - Server Setup${NC}"
echo -e "${GREEN}============================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo bash setup-server.sh)${NC}"
    exit 1
fi

# =============================================================================
# 1. System Updates
# =============================================================================
echo -e "\n${YELLOW}[1/8] Updating system packages...${NC}"
apt update && apt upgrade -y

# =============================================================================
# 2. Install Node.js 20.x
# =============================================================================
echo -e "\n${YELLOW}[2/8] Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version

# =============================================================================
# 3. Install PostgreSQL 15
# =============================================================================
echo -e "\n${YELLOW}[3/8] Installing PostgreSQL 15...${NC}"
apt install -y postgresql postgresql-contrib

# Start PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
echo -e "${YELLOW}Creating database and user...${NC}"
sudo -u postgres psql << EOF
CREATE USER inventory_user WITH PASSWORD 'CHANGE_THIS_PASSWORD';
CREATE DATABASE inventory_db OWNER inventory_user;
GRANT ALL PRIVILEGES ON DATABASE inventory_db TO inventory_user;
\q
EOF

echo -e "${GREEN}PostgreSQL installed and configured.${NC}"
echo -e "${RED}IMPORTANT: Change the password in production.env!${NC}"

# =============================================================================
# 4. Install Redis
# =============================================================================
echo -e "\n${YELLOW}[4/8] Installing Redis...${NC}"
apt install -y redis-server

# Configure Redis
sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
systemctl restart redis
systemctl enable redis

# Test Redis
redis-cli ping

# =============================================================================
# 5. Install Nginx
# =============================================================================
echo -e "\n${YELLOW}[5/8] Installing Nginx...${NC}"
apt install -y nginx

# Remove default config
rm -f /etc/nginx/sites-enabled/default

systemctl start nginx
systemctl enable nginx

# =============================================================================
# 6. Install Certbot for SSL
# =============================================================================
echo -e "\n${YELLOW}[6/8] Installing Certbot for SSL certificates...${NC}"
apt install -y certbot python3-certbot-nginx

# =============================================================================
# 7. Install PM2 for process management
# =============================================================================
echo -e "\n${YELLOW}[7/8] Installing PM2...${NC}"
npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# =============================================================================
# 8. Create application directories
# =============================================================================
echo -e "\n${YELLOW}[8/8] Creating application directories...${NC}"
mkdir -p /var/www/inventory/admin
mkdir -p /var/www/inventory/portal
mkdir -p /var/www/inventory/api
mkdir -p /var/www/inventory/logs

# Set permissions
chown -R www-data:www-data /var/www/inventory

# =============================================================================
# Firewall Configuration
# =============================================================================
echo -e "\n${YELLOW}Configuring firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}Server Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e ""
echo -e "Next steps:"
echo -e "1. Configure DNS records in GoDaddy (see dns-setup.md)"
echo -e "2. Run: ${YELLOW}bash setup-ssl.sh${NC}"
echo -e "3. Copy Nginx config: ${YELLOW}cp nginx/inventory.conf /etc/nginx/sites-available/${NC}"
echo -e "4. Enable site: ${YELLOW}ln -s /etc/nginx/sites-available/inventory.conf /etc/nginx/sites-enabled/${NC}"
echo -e "5. Deploy application: ${YELLOW}bash deploy.sh${NC}"
echo -e ""
echo -e "Installed versions:"
echo -e "  Node.js: $(node --version)"
echo -e "  npm: $(npm --version)"
echo -e "  PostgreSQL: $(psql --version | head -1)"
echo -e "  Redis: $(redis-server --version | cut -d= -f2 | cut -d' ' -f1)"
echo -e "  Nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
echo -e "  PM2: $(pm2 --version)"
