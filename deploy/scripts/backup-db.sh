#!/bin/bash
# =============================================================================
# Database Backup Script for Inventory Intelligence Platform
# Runs daily via cron, keeps 7 days of backups
# =============================================================================

set -e

# Configuration
BACKUP_DIR="/var/backups/inventory"
DB_NAME="inventory_db"
DB_USER="inventory_user"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/inventory_backup_$DATE.sql.gz"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "============================================"
echo "Database Backup - $(date)"
echo "============================================"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Perform the backup
echo -e "Creating backup..."
sudo -u postgres pg_dump $DB_NAME | gzip > $BACKUP_FILE

if [ $? -eq 0 ]; then
    FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE ($FILESIZE)${NC}"
else
    echo -e "${RED}✗ Backup failed!${NC}"
    exit 1
fi

# Delete old backups
echo -e "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
find $BACKUP_DIR -name "inventory_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
REMAINING=$(ls -1 $BACKUP_DIR/inventory_backup_*.sql.gz 2>/dev/null | wc -l)
echo -e "${GREEN}✓ $REMAINING backup(s) remaining${NC}"

# List current backups
echo ""
echo "Current backups:"
ls -lh $BACKUP_DIR/inventory_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo "============================================"
echo "Backup Complete"
echo "============================================"
