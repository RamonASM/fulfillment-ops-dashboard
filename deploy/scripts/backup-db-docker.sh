#!/bin/bash
# =============================================================================
# Docker Database Backup Script for Inventory Intelligence Platform
# =============================================================================
# Creates automated backups of PostgreSQL database in Docker environment
# Run: bash deploy/scripts/backup-db-docker.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"

COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.production.yml"
BACKUP_DIR="${DEPLOY_DIR}/backups"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DATE=$(date +%Y-%m-%d)

# Database settings (from .env or defaults)
DB_CONTAINER="${DB_CONTAINER:-inventory-postgres}"
DB_USER="${DB_USER:-inventory}"
DB_NAME="${DB_NAME:-inventory_db}"

# Retention settings
KEEP_DAILY=7      # Keep daily backups for 7 days
KEEP_WEEKLY=4     # Keep weekly backups for 4 weeks
KEEP_MONTHLY=3    # Keep monthly backups for 3 months

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Check Prerequisites
# =============================================================================
log_info "Starting database backup..."

# Check if Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker is not running!"
    exit 1
fi

# Check if PostgreSQL container is running
if ! docker ps | grep -q "${DB_CONTAINER}"; then
    log_error "PostgreSQL container '${DB_CONTAINER}' is not running!"
    exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"/{daily,weekly,monthly}

# =============================================================================
# Determine Backup Type
# =============================================================================
DAY_OF_WEEK=$(date +%u)  # 1-7 (Monday to Sunday)
DAY_OF_MONTH=$(date +%d)

if [ "$DAY_OF_MONTH" = "01" ]; then
    BACKUP_TYPE="monthly"
    BACKUP_PATH="${BACKUP_DIR}/monthly/${DB_NAME}_${BACKUP_DATE}.sql.gz"
elif [ "$DAY_OF_WEEK" = "7" ]; then  # Sunday
    BACKUP_TYPE="weekly"
    BACKUP_PATH="${BACKUP_DIR}/weekly/${DB_NAME}_${BACKUP_DATE}.sql.gz"
else
    BACKUP_TYPE="daily"
    BACKUP_PATH="${BACKUP_DIR}/daily/${DB_NAME}_${BACKUP_DATE}.sql.gz"
fi

log_info "Backup type: ${BACKUP_TYPE}"
log_info "Backup path: ${BACKUP_PATH}"

# =============================================================================
# Create Backup
# =============================================================================
log_info "Creating database dump..."

# Create SQL dump and compress
docker exec -t "${DB_CONTAINER}" pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --verbose \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    | gzip > "${BACKUP_PATH}"

# Check if backup was successful
if [ $? -eq 0 ] && [ -f "${BACKUP_PATH}" ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
    log_success "Backup created successfully (${BACKUP_SIZE})"
else
    log_error "Backup failed!"
    exit 1
fi

# =============================================================================
# Verify Backup
# =============================================================================
log_info "Verifying backup integrity..."

if gunzip -t "${BACKUP_PATH}" 2>/dev/null; then
    log_success "Backup integrity verified"
else
    log_error "Backup file is corrupted!"
    exit 1
fi

# =============================================================================
# Create Metadata File
# =============================================================================
METADATA_FILE="${BACKUP_PATH%.gz}.meta"
cat > "${METADATA_FILE}" << EOF
Backup Metadata
===============
Database: ${DB_NAME}
Container: ${DB_CONTAINER}
Type: ${BACKUP_TYPE}
Date: $(date)
Size: ${BACKUP_SIZE}
Git Commit: $(cd "${PROJECT_ROOT}" && git rev-parse HEAD 2>/dev/null || echo "N/A")
Docker Image: $(docker inspect "${DB_CONTAINER}" --format='{{.Config.Image}}')
EOF

# =============================================================================
# Cleanup Old Backups
# =============================================================================
log_info "Cleaning up old backups..."

# Clean daily backups (keep last 7)
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${KEEP_DAILY} -delete
DAILY_CLEANED=$(find "${BACKUP_DIR}/daily" -name "*.meta" -mtime +${KEEP_DAILY} -delete | wc -l)

# Clean weekly backups (keep last 4 weeks)
find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -mtime +$((KEEP_WEEKLY * 7)) -delete
WEEKLY_CLEANED=$(find "${BACKUP_DIR}/weekly" -name "*.meta" -mtime +$((KEEP_WEEKLY * 7)) -delete | wc -l)

# Clean monthly backups (keep last 3 months)
find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -mtime +$((KEEP_MONTHLY * 30)) -delete
MONTHLY_CLEANED=$(find "${BACKUP_DIR}/monthly" -name "*.meta" -mtime +$((KEEP_MONTHLY * 30)) -delete | wc -l)

log_info "Cleaned up old backups: ${DAILY_CLEANED} daily, ${WEEKLY_CLEANED} weekly, ${MONTHLY_CLEANED} monthly"

# =============================================================================
# Upload to Remote Storage (Optional)
# =============================================================================
# Uncomment and configure if you want to upload to S3, Azure, or other storage

# if [ -n "${AWS_S3_BACKUP_BUCKET}" ]; then
#     log_info "Uploading to S3..."
#     aws s3 cp "${BACKUP_PATH}" "s3://${AWS_S3_BACKUP_BUCKET}/database-backups/${BACKUP_TYPE}/" || \
#         log_error "S3 upload failed"
# fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Backup Summary${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Type:     ${BACKUP_TYPE}"
echo "File:     ${BACKUP_PATH}"
echo "Size:     ${BACKUP_SIZE}"
echo "Time:     $(date)"
echo ""

# List all backups
log_info "Current backups:"
echo ""
echo "Daily backups (${KEEP_DAILY} days):"
ls -lh "${BACKUP_DIR}/daily" 2>/dev/null | tail -n +2 || echo "  None"
echo ""
echo "Weekly backups (${KEEP_WEEKLY} weeks):"
ls -lh "${BACKUP_DIR}/weekly" 2>/dev/null | tail -n +2 || echo "  None"
echo ""
echo "Monthly backups (${KEEP_MONTHLY} months):"
ls -lh "${BACKUP_DIR}/monthly" 2>/dev/null | tail -n +2 || echo "  None"
echo ""

# =============================================================================
# Restore Instructions
# =============================================================================
log_info "To restore from this backup:"
echo "  gunzip < ${BACKUP_PATH} | docker exec -i ${DB_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"
echo ""

exit 0
