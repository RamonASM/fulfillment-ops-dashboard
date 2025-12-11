# Deployment Guide - Inventory Intelligence Platform

## Quick Start (~30 minutes)

### Step 1: Create a DigitalOcean Droplet (~5 min)

1. Go to https://cloud.digitalocean.com/
2. Click **Create** → **Droplets**
3. Choose:
   - **Region:** New York or San Francisco (closest to you)
   - **Image:** Ubuntu 22.04 LTS
   - **Size:** Basic $6/mo (1 GB RAM, 1 CPU, 25 GB SSD)
   - **Authentication:** SSH Key (recommended) or Password
4. Click **Create Droplet**
5. Note your droplet's IP address (e.g., `165.232.140.123`)

### Step 2: Configure DNS in GoDaddy (~5 min)

1. Log in to GoDaddy
2. Go to **My Products** → **yourtechassist.us** → **DNS**
3. Add these A records (replace IP with your droplet's IP):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_DROPLET_IP | 600 |
| A | www | YOUR_DROPLET_IP | 600 |
| A | admin | YOUR_DROPLET_IP | 600 |
| A | portal | YOUR_DROPLET_IP | 600 |
| A | api | YOUR_DROPLET_IP | 600 |

4. Wait 5-10 minutes for propagation

### Step 3: Setup Server (~10 min)

SSH into your droplet:
```bash
ssh root@YOUR_DROPLET_IP
```

Clone the repo and run setup:
```bash
# Clone repository
git clone https://github.com/yourusername/fulfillment-ops-dashboard.git /var/www/inventory
cd /var/www/inventory/deploy/scripts

# Make scripts executable
chmod +x *.sh

# Run server setup (installs Node, PostgreSQL, Redis, Nginx, PM2)
bash setup-server.sh
```

### Step 4: Configure SSL (~5 min)

```bash
# Get SSL certificates (DNS must be propagated)
bash setup-ssl.sh
```

### Step 5: Configure Environment (~5 min)

```bash
# Copy and edit environment file
cp /var/www/inventory/deploy/production.env /var/www/inventory/.env
nano /var/www/inventory/.env
```

**Required changes in .env:**
1. Set `DATABASE_URL` password (generate secure password)
2. Generate and set `JWT_SECRET`: `openssl rand -base64 32`
3. Generate and set `JWT_REFRESH_SECRET`: `openssl rand -base64 32`
4. Generate and set `SESSION_SECRET`: `openssl rand -base64 32`

**Update PostgreSQL password to match:**
```bash
sudo -u postgres psql -c "ALTER USER inventory_user WITH PASSWORD 'your_secure_password';"
```

### Step 6: Deploy Application (~5 min)

```bash
# Install Nginx config
cp /var/www/inventory/deploy/nginx/inventory.conf /etc/nginx/sites-available/
ln -s /etc/nginx/sites-available/inventory.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Deploy!
bash deploy.sh
```

### Step 7: Seed Database (First time only)

```bash
cd /var/www/inventory
npm run db:seed
```

---

## Your Live URLs

After deployment:

| URL | Purpose | Default Credentials |
|-----|---------|-------------------|
| https://admin.yourtechassist.us | Admin Dashboard | sarah.chen@inventoryiq.com / demo1234 |
| https://portal.yourtechassist.us | Client Portal | john.doe@acmecorp.com / client1234 |
| https://api.yourtechassist.us | API Server | N/A |

---

## Monitoring & Maintenance

### View Logs
```bash
pm2 logs inventory-api          # API logs
pm2 logs inventory-api --lines 100  # Last 100 lines
tail -f /var/www/inventory/logs/api-error.log
```

### Restart Services
```bash
pm2 restart inventory-api       # Restart API
systemctl restart nginx         # Restart Nginx
systemctl restart postgresql    # Restart PostgreSQL
systemctl restart redis         # Restart Redis
```

### Check Status
```bash
pm2 status                      # PM2 process status
systemctl status nginx          # Nginx status
systemctl status postgresql     # PostgreSQL status
curl https://api.yourtechassist.us/health  # API health check
```

### Update Application
```bash
cd /var/www/inventory/deploy/scripts
bash deploy.sh
```

---

## Estimated Costs

| Service | Monthly Cost |
|---------|-------------|
| DigitalOcean Droplet | $6 |
| Domain (yourtechassist.us) | ~$1-2/mo averaged |
| SSL Certificate | Free (Let's Encrypt) |
| **Total** | **~$7-8/month** |

---

## Security Checklist

- [ ] Change default database password
- [ ] Generate strong JWT secrets
- [ ] Enable UFW firewall (done by setup script)
- [ ] Set up SSH keys instead of password
- [ ] Change default user passwords after first login
- [ ] Consider enabling fail2ban for brute force protection

---

## Troubleshooting

### DNS not working?
```bash
dig admin.yourtechassist.us +short
# Should return your server IP
```

### SSL certificate errors?
```bash
sudo certbot renew --dry-run
sudo certbot certificates
```

### API not responding?
```bash
pm2 logs inventory-api --lines 50
curl http://localhost:3001/health
```

### Database connection issues?
```bash
sudo -u postgres psql -c "SELECT 1;"
npm run db:push
```

### Nginx errors?
```bash
nginx -t
systemctl status nginx
cat /var/log/nginx/error.log
```
