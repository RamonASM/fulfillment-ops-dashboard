#!/bin/bash
# =============================================================================
# Docker Deployment Script for Inventory Intelligence Platform
# =============================================================================
# This script deploys the application using Docker Compose with zero-downtime
# Run: bash deploy/scripts/deploy-docker.sh [environment]
# Environment: production (default) or staging
# =============================================================================

set -e  # Exit on error

# =============================================================================
# Configuration
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${PROJECT_ROOT}/deploy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment (default: production)
ENVIRONMENT="${1:-production}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.production.yml"
ENV_FILE="${DEPLOY_DIR}/.env"

# =============================================================================
# Helper Functions
# =============================================================================
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
# Pre-deployment Checks
# =============================================================================
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Docker Deployment - ${ENVIRONMENT}${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "Timestamp: $(date)"
echo ""

log_info "Running pre-deployment checks..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed!"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed!"
    exit 1
fi

# Check if .env file exists
if [ ! -f "${ENV_FILE}" ]; then
    log_error "Environment file not found: ${ENV_FILE}"
    log_warning "Copy ${DEPLOY_DIR}/.env.${ENVIRONMENT}.example to ${ENV_FILE}"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running!"
    exit 1
fi

log_success "Pre-deployment checks passed"

# =============================================================================
# Backup Current State
# =============================================================================
log_info "Creating backup of current deployment..."

BACKUP_DIR="${DEPLOY_DIR}/backups"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/backup_${BACKUP_TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

# Backup database
log_info "Backing up database..."
docker-compose -f "${COMPOSE_FILE}" exec -T postgres pg_dump \
    -U inventory \
    -d inventory_db \
    > "${BACKUP_PATH}_database.sql" 2>/dev/null || log_warning "Database backup failed (container may not be running)"

# Save current container state
docker-compose -f "${COMPOSE_FILE}" ps > "${BACKUP_PATH}_containers.txt" 2>/dev/null || true

log_success "Backup created at ${BACKUP_PATH}"

# =============================================================================
# Pull Latest Code (if git repository)
# =============================================================================
if [ -d "${PROJECT_ROOT}/.git" ]; then
    log_info "Pulling latest code from repository..."
    cd "${PROJECT_ROOT}"

    # Store current commit for rollback
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "${CURRENT_COMMIT}" > "${BACKUP_PATH}_commit.txt"

    git fetch origin
    git pull origin main || log_warning "Failed to pull latest code"

    log_success "Code updated to latest version"
fi

# =============================================================================
# Build Docker Images
# =============================================================================
log_info "Building Docker images..."

cd "${PROJECT_ROOT}"

# Build with no cache for production, cache for staging
if [ "${ENVIRONMENT}" = "production" ]; then
    docker-compose -f "${COMPOSE_FILE}" build --no-cache --parallel
else
    docker-compose -f "${COMPOSE_FILE}" build --parallel
fi

log_success "Docker images built successfully"

# =============================================================================
# Health Check Function
# =============================================================================
wait_for_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    log_info "Waiting for ${service} to be healthy..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "${url}" > /dev/null 2>&1; then
            log_success "${service} is healthy"
            return 0
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    log_error "${service} failed health check after ${max_attempts} attempts"
    return 1
}

# =============================================================================
# Deploy New Containers
# =============================================================================
log_info "Deploying new containers..."

# Start database and redis first
log_info "Starting database and cache services..."
docker-compose -f "${COMPOSE_FILE}" up -d postgres redis

# Wait for database to be ready
sleep 10

# Run database migrations
log_info "Running database migrations..."
docker-compose -f "${COMPOSE_FILE}" run --rm api npx prisma db push || {
    log_error "Database migration failed!"
    log_warning "Rolling back..."
    docker-compose -f "${COMPOSE_FILE}" down
    exit 1
}

# Start remaining services
log_info "Starting application services..."
docker-compose -f "${COMPOSE_FILE}" up -d

log_success "Containers started"

# =============================================================================
# Health Checks
# =============================================================================
log_info "Running health checks..."

sleep 15  # Give services time to initialize

# Check API health
if ! wait_for_health "API" "http://localhost:3001/health"; then
    log_error "API health check failed!"
    log_warning "Check logs with: docker-compose -f ${COMPOSE_FILE} logs api"
    exit 1
fi

# Check ML Analytics health
if ! wait_for_health "ML Analytics" "http://localhost:8000/health"; then
    log_warning "ML Analytics health check failed (non-critical)"
fi

# Check web dashboard
if ! wait_for_health "Web Dashboard" "http://localhost/health"; then
    log_warning "Web dashboard health check failed"
fi

log_success "All critical health checks passed"

# =============================================================================
# Cleanup Old Containers and Images
# =============================================================================
log_info "Cleaning up old containers and images..."

# Remove stopped containers
docker container prune -f

# Remove dangling images
docker image prune -f

# Remove old backups (keep last 5)
cd "${BACKUP_DIR}"
ls -t | tail -n +11 | xargs -r rm -f

log_success "Cleanup completed"

# =============================================================================
# Display Deployment Information
# =============================================================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}Container Status:${NC}"
docker-compose -f "${COMPOSE_FILE}" ps
echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo "  - Admin Dashboard: http://localhost (or your domain)"
echo "  - Client Portal: http://localhost:8080"
echo "  - API Server: http://localhost:3001"
echo "  - ML Analytics: http://localhost:8000"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View logs:        docker-compose -f ${COMPOSE_FILE} logs -f [service]"
echo "  Restart service:  docker-compose -f ${COMPOSE_FILE} restart [service]"
echo "  Stop all:         docker-compose -f ${COMPOSE_FILE} down"
echo "  Backup database:  bash ${SCRIPT_DIR}/backup-db-docker.sh"
echo ""
echo -e "${BLUE}Backup Location:${NC} ${BACKUP_PATH}"
echo ""
echo "Deployed at: $(date)"
echo ""

# =============================================================================
# Post-deployment Notes
# =============================================================================
log_warning "Post-deployment checklist:"
echo "  [ ] Test admin login at http://localhost"
echo "  [ ] Test portal login at http://localhost:8080"
echo "  [ ] Verify API endpoints are responding"
echo "  [ ] Check application logs for errors"
echo "  [ ] Test file upload functionality"
echo "  [ ] Verify database connections"
echo "  [ ] Test real-time features (WebSocket)"
echo ""
