#!/bin/bash
# =============================================================================
# Rollback Script for Inventory Intelligence Platform
# =============================================================================
# This script rolls back to a previous deployment state
# Run: bash deploy/scripts/rollback.sh [backup_timestamp]
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${PROJECT_ROOT}/deploy"
BACKUP_DIR="${DEPLOY_DIR}/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Deployment mode
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-docker}"  # docker or pm2

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Check Backup Directory
# =============================================================================
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Rollback Utility${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

if [ ! -d "${BACKUP_DIR}" ]; then
    log_error "Backup directory not found: ${BACKUP_DIR}"
    exit 1
fi

# =============================================================================
# List Available Backups
# =============================================================================
log_info "Available backups:"
echo ""

backups=($(ls -t "${BACKUP_DIR}"/*_database.sql 2>/dev/null | head -10 || true))

if [ ${#backups[@]} -eq 0 ]; then
    log_error "No backups found!"
    exit 1
fi

i=1
for backup in "${backups[@]}"; do
    backup_name=$(basename "$backup" _database.sql)
    backup_timestamp=${backup_name#backup_}
    backup_date=$(echo $backup_timestamp | sed 's/\([0-9]\{8\}\)_\([0-9]\{6\}\)/\1 \2/')
    backup_size=$(ls -lh "$backup" | awk '{print $5}')

    echo "  [$i] ${backup_date} (${backup_size})"
    i=$((i + 1))
done

echo ""

# =============================================================================
# Select Backup
# =============================================================================
if [ -n "$1" ]; then
    # Use provided backup timestamp
    BACKUP_TIMESTAMP="$1"
    BACKUP_PATH="${BACKUP_DIR}/backup_${BACKUP_TIMESTAMP}"
else
    # Interactive selection
    read -p "Select backup number to restore (or 'q' to quit): " selection

    if [ "$selection" = "q" ]; then
        echo "Rollback cancelled."
        exit 0
    fi

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt ${#backups[@]} ]; then
        log_error "Invalid selection!"
        exit 1
    fi

    selected_backup=${backups[$((selection - 1))]}
    BACKUP_PATH=$(dirname "$selected_backup")/$(basename "$selected_backup" _database.sql)
fi

# Check if backup exists
if [ ! -f "${BACKUP_PATH}_database.sql" ]; then
    log_error "Backup not found: ${BACKUP_PATH}_database.sql"
    exit 1
fi

# =============================================================================
# Confirmation
# =============================================================================
echo ""
log_warning "This will:"
echo "  1. Stop the current application"
echo "  2. Restore database from backup"
echo "  3. Rollback code (if git commit info available)"
echo "  4. Restart services"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi

# =============================================================================
# Create Pre-Rollback Backup
# =============================================================================
log_info "Creating pre-rollback backup..."

PRE_ROLLBACK_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_ROLLBACK_PATH="${BACKUP_DIR}/pre_rollback_${PRE_ROLLBACK_TIMESTAMP}"

if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" exec -T postgres pg_dump \
        -U inventory \
        -d inventory_db \
        > "${PRE_ROLLBACK_PATH}_database.sql" || log_warning "Pre-rollback backup failed"
else
    sudo -u postgres pg_dump inventory_db > "${PRE_ROLLBACK_PATH}_database.sql" || log_warning "Pre-rollback backup failed"
fi

log_success "Pre-rollback backup created"

# =============================================================================
# Stop Services
# =============================================================================
log_info "Stopping services..."

if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" down
else
    pm2 stop ecosystem.config.js || true
    systemctl stop nginx || true
fi

log_success "Services stopped"

# =============================================================================
# Restore Database
# =============================================================================
log_info "Restoring database from backup..."

if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    # Start only database for restore
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" up -d postgres
    sleep 10

    # Drop and recreate database
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" exec -T postgres psql -U inventory -c "DROP DATABASE IF EXISTS inventory_db;"
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" exec -T postgres psql -U inventory -c "CREATE DATABASE inventory_db;"

    # Restore from backup
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" exec -T postgres psql -U inventory -d inventory_db < "${BACKUP_PATH}_database.sql"
else
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS inventory_db;"
    sudo -u postgres psql -c "CREATE DATABASE inventory_db OWNER inventory_user;"
    sudo -u postgres psql inventory_db < "${BACKUP_PATH}_database.sql"
fi

log_success "Database restored"

# =============================================================================
# Rollback Code (if git)
# =============================================================================
if [ -f "${BACKUP_PATH}_commit.txt" ]; then
    log_info "Rolling back code to previous commit..."

    cd "${PROJECT_ROOT}"
    ROLLBACK_COMMIT=$(cat "${BACKUP_PATH}_commit.txt")

    git checkout "$ROLLBACK_COMMIT" || {
        log_error "Failed to rollback code to commit: $ROLLBACK_COMMIT"
        log_warning "Continuing with current code..."
    }

    log_success "Code rolled back to commit: $ROLLBACK_COMMIT"
else
    log_warning "No commit information found, skipping code rollback"
fi

# =============================================================================
# Restart Services
# =============================================================================
log_info "Restarting services..."

if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    # Rebuild and restart
    docker-compose -f "${DEPLOY_DIR}/docker-compose.production.yml" up -d --build

    # Wait for health checks
    sleep 15

    if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
        log_success "API is healthy"
    else
        log_error "API health check failed!"
    fi
else
    # Rebuild application
    cd "${PROJECT_ROOT}"
    npm run build

    # Restart services
    pm2 restart ecosystem.config.js
    systemctl restart nginx
fi

log_success "Services restarted"

# =============================================================================
# Verify Rollback
# =============================================================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Rollback Completed${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
log_info "Verification steps:"
echo "  1. Check application logs"
echo "  2. Test admin login"
echo "  3. Verify critical functionality"
echo "  4. Monitor for errors"
echo ""
log_warning "Pre-rollback backup saved at: ${PRE_ROLLBACK_PATH}"
echo "  You can restore to this point if needed"
echo ""
