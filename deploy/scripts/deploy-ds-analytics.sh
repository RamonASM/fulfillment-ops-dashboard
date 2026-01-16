#!/bin/bash
# DS Analytics Deployment Script
# Deploys the Python DS Analytics service to production

set -e

# Configuration
SERVER=${SERVER:-"root@138.197.70.205"}
SSH_KEY=${SSH_KEY:-"~/.ssh/id_ed25519_deploy"}
REMOTE_DIR="/opt/inventory-api"
DS_ANALYTICS_DIR="$REMOTE_DIR/apps/ds-analytics"
LOCAL_DS_ANALYTICS="apps/ds-analytics"

echo "=== DS Analytics Deployment Script ==="
echo "Server: $SERVER"
echo "Remote Dir: $REMOTE_DIR"

# Check SSH connectivity
echo ""
echo "1. Checking SSH connectivity..."
ssh -i $SSH_KEY -o ConnectTimeout=10 $SERVER "echo 'SSH connection successful'" || {
    echo "Error: Cannot connect to server"
    exit 1
}

# Create remote directories
echo ""
echo "2. Creating remote directories..."
ssh -i $SSH_KEY $SERVER "mkdir -p $DS_ANALYTICS_DIR/services $DS_ANALYTICS_DIR/models $DS_ANALYTICS_DIR/utils $DS_ANALYTICS_DIR/tests"

# Copy DS Analytics files
echo ""
echo "3. Copying DS Analytics files..."
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/main.py $SERVER:$DS_ANALYTICS_DIR/
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/requirements.txt $SERVER:$DS_ANALYTICS_DIR/
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/services/*.py $SERVER:$DS_ANALYTICS_DIR/services/
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/models/*.py $SERVER:$DS_ANALYTICS_DIR/models/
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/utils/*.py $SERVER:$DS_ANALYTICS_DIR/utils/

# Copy tests
echo ""
echo "4. Copying test files..."
scp -i $SSH_KEY $LOCAL_DS_ANALYTICS/tests/*.py $SERVER:$DS_ANALYTICS_DIR/tests/ 2>/dev/null || echo "No test files to copy"

# Copy systemd service file
echo ""
echo "5. Installing systemd service..."
scp -i $SSH_KEY deploy/ds-analytics.service $SERVER:/etc/systemd/system/ds-analytics.service

# Setup Python environment on server
echo ""
echo "6. Setting up Python environment on server..."
ssh -i $SSH_KEY $SERVER << 'REMOTE_SCRIPT'
cd /opt/inventory-api/apps/ds-analytics

# Install Python 3 full (includes venv) if not present
if ! command -v python3 &> /dev/null; then
    echo "Installing Python 3..."
    apt update
    apt install -y python3-full python3-venv python3-dev
fi

# Remove old venv if exists and recreate
if [ -d "venv" ]; then
    echo "Removing old virtual environment..."
    rm -rf venv
fi

echo "Creating virtual environment..."
python3 -m venv venv

# Install dependencies
echo "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Create .env file with DATABASE_URL from environment or main API
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    # Try to get DATABASE_URL from the main API's environment
    if [ -f "/opt/inventory-api/.env" ]; then
        DB_URL=$(grep DATABASE_URL /opt/inventory-api/.env | cut -d '=' -f2-)
    else
        # Use the production database URL
        DB_URL="postgresql://inventory_user:your_password@localhost:5432/inventory_db"
    fi
    echo "DATABASE_URL=$DB_URL" > .env
    echo "PORT=8000" >> .env
    echo "WORKERS=2" >> .env
    echo "LOG_LEVEL=info" >> .env
fi
REMOTE_SCRIPT

# Reload systemd and start service
echo ""
echo "7. Starting DS Analytics service..."
ssh -i $SSH_KEY $SERVER << 'REMOTE_SCRIPT'
systemctl daemon-reload
systemctl enable ds-analytics
systemctl restart ds-analytics
sleep 3
systemctl status ds-analytics --no-pager
REMOTE_SCRIPT

# Verify deployment
echo ""
echo "8. Verifying deployment..."
ssh -i $SSH_KEY $SERVER << 'REMOTE_SCRIPT'
echo "Checking DS Analytics health..."
for i in {1..5}; do
    response=$(curl -s http://localhost:8000/health 2>/dev/null)
    if echo "$response" | grep -q '"status":"healthy"'; then
        echo "DS Analytics is healthy!"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
        exit 0
    fi
    echo "Waiting for service to start... (attempt $i/5)"
    sleep 2
done
echo "Warning: Health check failed"
exit 1
REMOTE_SCRIPT

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "DS Analytics is now running at http://localhost:8000 on the server"
echo ""
echo "To check status: ssh -i $SSH_KEY $SERVER 'systemctl status ds-analytics'"
echo "To view logs: ssh -i $SSH_KEY $SERVER 'journalctl -u ds-analytics -f'"
