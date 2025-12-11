#!/bin/bash
# =============================================================================
# SSL Setup Script - Let's Encrypt Certificates
# Run AFTER DNS is configured and propagated
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="yourtechassist.us"
EMAIL="admin@yourtechassist.us"  # Change this to your email

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}SSL Certificate Setup for ${DOMAIN}${NC}"
echo -e "${GREEN}============================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo bash setup-ssl.sh)${NC}"
    exit 1
fi

# =============================================================================
# Test DNS Resolution
# =============================================================================
echo -e "\n${YELLOW}Testing DNS resolution...${NC}"

check_dns() {
    local subdomain=$1
    local ip=$(dig +short ${subdomain}.${DOMAIN} A)
    if [ -z "$ip" ]; then
        echo -e "${RED}✗ ${subdomain}.${DOMAIN} - NOT RESOLVED${NC}"
        return 1
    else
        echo -e "${GREEN}✓ ${subdomain}.${DOMAIN} -> ${ip}${NC}"
        return 0
    fi
}

DNS_OK=true
check_dns "" || DNS_OK=false
check_dns "www" || DNS_OK=false
check_dns "admin" || DNS_OK=false
check_dns "portal" || DNS_OK=false
check_dns "api" || DNS_OK=false

if [ "$DNS_OK" = false ]; then
    echo -e "\n${RED}DNS records not fully propagated. Please wait and try again.${NC}"
    echo -e "${YELLOW}You can check propagation at: https://www.whatsmydns.net/${NC}"
    exit 1
fi

# =============================================================================
# Stop Nginx temporarily for standalone verification
# =============================================================================
echo -e "\n${YELLOW}Stopping Nginx for certificate verification...${NC}"
systemctl stop nginx

# =============================================================================
# Obtain Certificate
# =============================================================================
echo -e "\n${YELLOW}Obtaining SSL certificate...${NC}"

certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    -d ${DOMAIN} \
    -d www.${DOMAIN} \
    -d admin.${DOMAIN} \
    -d portal.${DOMAIN} \
    -d api.${DOMAIN}

# =============================================================================
# Restart Nginx
# =============================================================================
echo -e "\n${YELLOW}Starting Nginx...${NC}"
systemctl start nginx

# =============================================================================
# Setup Auto-Renewal
# =============================================================================
echo -e "\n${YELLOW}Setting up automatic renewal...${NC}"

# Create renewal hook to reload nginx
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh

# Test renewal
echo -e "\n${YELLOW}Testing certificate renewal...${NC}"
certbot renew --dry-run

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}SSL Certificate Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e ""
echo -e "Certificate location: /etc/letsencrypt/live/${DOMAIN}/"
echo -e "Auto-renewal: Enabled (twice daily via certbot timer)"
echo -e ""
echo -e "Next steps:"
echo -e "1. Copy Nginx config: ${YELLOW}cp ../nginx/inventory.conf /etc/nginx/sites-available/${NC}"
echo -e "2. Enable site: ${YELLOW}ln -s /etc/nginx/sites-available/inventory.conf /etc/nginx/sites-enabled/${NC}"
echo -e "3. Test config: ${YELLOW}nginx -t${NC}"
echo -e "4. Reload Nginx: ${YELLOW}systemctl reload nginx${NC}"
echo -e "5. Deploy application: ${YELLOW}bash deploy.sh${NC}"
