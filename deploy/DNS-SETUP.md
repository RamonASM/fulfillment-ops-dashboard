# DNS Setup Guide for GoDaddy

## Your Domain: yourtechassist.us

## Required DNS Records

Once you have a server (DigitalOcean Droplet, etc.), you'll get an IP address.
Replace `YOUR_SERVER_IP` below with your actual server IP.

### Step-by-Step GoDaddy Instructions:

1. Log in to your GoDaddy account
2. Go to **My Products** → Find **yourtechassist.us** → Click **DNS**
3. Add/Edit the following records:

---

## A Records (Required)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_SERVER_IP | 600 |
| A | www | YOUR_SERVER_IP | 600 |
| A | admin | YOUR_SERVER_IP | 600 |
| A | portal | YOUR_SERVER_IP | 600 |
| A | api | YOUR_SERVER_IP | 600 |

### How to add in GoDaddy:
1. Click **Add** button
2. Select **A** from the Type dropdown
3. Enter the Name (e.g., `admin`)
4. Enter your server IP in the **Value** field
5. Set TTL to **600 seconds** (10 minutes) for faster propagation
6. Click **Save**

---

## Example with IP 165.232.140.123

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 165.232.140.123 | 600 |
| A | www | 165.232.140.123 | 600 |
| A | admin | 165.232.140.123 | 600 |
| A | portal | 165.232.140.123 | 600 |
| A | api | 165.232.140.123 | 600 |

---

## Verification

After adding records, verify propagation:

1. **Command line:**
   ```bash
   dig admin.yourtechassist.us +short
   dig portal.yourtechassist.us +short
   dig api.yourtechassist.us +short
   ```

2. **Online tool:** https://www.whatsmydns.net/
   - Enter `admin.yourtechassist.us`
   - Select **A** record type
   - Click **Search**

DNS propagation typically takes 5-30 minutes, but can take up to 48 hours.

---

## URL Structure After Setup

| URL | Purpose |
|-----|---------|
| https://admin.yourtechassist.us | Admin Dashboard |
| https://portal.yourtechassist.us | Client Portal |
| https://api.yourtechassist.us | API Server |
| https://yourtechassist.us | Redirects to admin |

---

## Troubleshooting

### DNS not propagating?
- Double-check the IP address is correct
- Wait 10-30 minutes
- Try flushing your local DNS cache:
  - Mac: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
  - Windows: `ipconfig /flushdns`

### Already have DNS records?
- Edit existing records instead of adding new ones
- Remove any conflicting CNAME records for the same subdomains

### Using Cloudflare?
If you've enabled Cloudflare, you can either:
1. Point GoDaddy nameservers to Cloudflare (recommended)
2. Or set up records directly in Cloudflare dashboard

---

## Next Steps

After DNS is configured and propagated:

1. SSH into your server
2. Run the server setup script: `sudo bash setup-server.sh`
3. Run SSL setup: `sudo bash setup-ssl.sh`
4. Deploy the application: `bash deploy.sh`
