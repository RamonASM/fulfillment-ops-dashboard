#!/bin/bash
# =============================================================================
# Health Check Script for Inventory Intelligence Platform
# =============================================================================
# Performs comprehensive health checks on all services
# Run: bash deploy/scripts/health-check.sh
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-docker}"  # docker or pm2

# Endpoints
API_URL="${API_URL:-http://localhost:3001}"
WEB_URL="${WEB_URL:-http://localhost}"
PORTAL_URL="${PORTAL_URL:-http://localhost:8080}"
ML_URL="${ML_URL:-http://localhost:8000}"

# Health check results
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# =============================================================================
# Helper Functions
# =============================================================================
check_endpoint() {
    local name=$1
    local url=$2
    local critical=$3  # true or false

    printf "%-30s" "Checking ${name}..."

    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}" 2>/dev/null)

    if [ "$response" = "200" ] || [ "$response" = "204" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $response)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        if [ "$critical" = "true" ]; then
            echo -e "${RED}✗ FAIL${NC} (HTTP $response)"
            CHECKS_FAILED=$((CHECKS_FAILED + 1))
        else
            echo -e "${YELLOW}⚠ WARNING${NC} (HTTP $response)"
            CHECKS_WARNING=$((CHECKS_WARNING + 1))
        fi
        return 1
    fi
}

check_service() {
    local name=$1
    local command=$2

    printf "%-30s" "Checking ${name}..."

    if eval "$command" &>/dev/null; then
        echo -e "${GREEN}✓ PASS${NC}"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        return 1
    fi
}

check_docker_container() {
    local container=$1

    printf "%-30s" "Container ${container}..."

    if docker ps --filter "name=${container}" --filter "status=running" | grep -q "${container}"; then
        health=$(docker inspect --format='{{.State.Health.Status}}' "${container}" 2>/dev/null || echo "none")
        if [ "$health" = "healthy" ] || [ "$health" = "none" ]; then
            echo -e "${GREEN}✓ PASS${NC} (Running, Health: ${health})"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            return 0
        else
            echo -e "${YELLOW}⚠ WARNING${NC} (Running, Health: ${health})"
            CHECKS_WARNING=$((CHECKS_WARNING + 1))
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Not running)"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        return 1
    fi
}

# =============================================================================
# Health Check Report
# =============================================================================
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Health Check Report${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "Timestamp: $(date)"
echo -e "Mode: ${DEPLOYMENT_MODE}"
echo ""

# =============================================================================
# System Resource Checks
# =============================================================================
echo -e "${BLUE}[1] System Resources${NC}"
echo "-------------------------------------------"

# Disk space
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
printf "%-30s" "Disk Usage..."
if [ "$disk_usage" -lt 80 ]; then
    echo -e "${GREEN}✓ PASS${NC} (${disk_usage}%)"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
elif [ "$disk_usage" -lt 90 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC} (${disk_usage}%)"
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
else
    echo -e "${RED}✗ FAIL${NC} (${disk_usage}% - Critical)"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
fi

# Memory usage
mem_usage=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')
printf "%-30s" "Memory Usage..."
if [ "$mem_usage" -lt 80 ]; then
    echo -e "${GREEN}✓ PASS${NC} (${mem_usage}%)"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
elif [ "$mem_usage" -lt 90 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC} (${mem_usage}%)"
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
else
    echo -e "${RED}✗ FAIL${NC} (${mem_usage}% - Critical)"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
fi

echo ""

# =============================================================================
# Container/Process Checks
# =============================================================================
if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    echo -e "${BLUE}[2] Docker Containers${NC}"
    echo "-------------------------------------------"

    check_docker_container "inventory-postgres"
    check_docker_container "inventory-redis"
    check_docker_container "inventory-api"
    check_docker_container "inventory-web"
    check_docker_container "inventory-ml-analytics"
else
    echo -e "${BLUE}[2] System Services${NC}"
    echo "-------------------------------------------"

    check_service "PostgreSQL" "systemctl is-active postgresql"
    check_service "Redis" "systemctl is-active redis"
    check_service "Nginx" "systemctl is-active nginx"
    check_service "PM2" "pm2 list | grep -q inventory-api"
fi

echo ""

# =============================================================================
# Database Checks
# =============================================================================
echo -e "${BLUE}[3] Database Connectivity${NC}"
echo "-------------------------------------------"

if [ "$DEPLOYMENT_MODE" = "docker" ]; then
    check_service "PostgreSQL Connection" "docker exec inventory-postgres pg_isready -U inventory"
    check_service "Redis Connection" "docker exec inventory-redis redis-cli ping"
else
    check_service "PostgreSQL Connection" "pg_isready -h localhost -p 5432"
    check_service "Redis Connection" "redis-cli ping"
fi

echo ""

# =============================================================================
# HTTP Endpoint Checks
# =============================================================================
echo -e "${BLUE}[4] HTTP Endpoints${NC}"
echo "-------------------------------------------"

check_endpoint "API Health" "${API_URL}/health" true
check_endpoint "Web Dashboard" "${WEB_URL}/health" true
check_endpoint "Client Portal" "${PORTAL_URL}/health" true
check_endpoint "ML Analytics" "${ML_URL}/health" false

echo ""

# =============================================================================
# API Functionality Checks
# =============================================================================
echo -e "${BLUE}[5] API Functionality${NC}"
echo "-------------------------------------------"

# Test API response time
printf "%-30s" "API Response Time..."
start_time=$(date +%s%N)
response=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/health" 2>/dev/null)
end_time=$(date +%s%N)
response_time=$(((end_time - start_time) / 1000000))  # Convert to milliseconds

if [ "$response" = "200" ]; then
    if [ "$response_time" -lt 500 ]; then
        echo -e "${GREEN}✓ PASS${NC} (${response_time}ms)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    elif [ "$response_time" -lt 2000 ]; then
        echo -e "${YELLOW}⚠ WARNING${NC} (${response_time}ms - Slow)"
        CHECKS_WARNING=$((CHECKS_WARNING + 1))
    else
        echo -e "${RED}✗ FAIL${NC} (${response_time}ms - Too Slow)"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC} (No response)"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
fi

# Test WebSocket endpoint
check_endpoint "WebSocket Endpoint" "${API_URL}/socket.io/" false

echo ""

# =============================================================================
# Security Checks
# =============================================================================
echo -e "${BLUE}[6] Security Configuration${NC}"
echo "-------------------------------------------"

# Check for security headers on web dashboard
printf "%-30s" "Security Headers..."
headers=$(curl -s -I "${WEB_URL}" 2>/dev/null)

if echo "$headers" | grep -q "X-Content-Type-Options" && \
   echo "$headers" | grep -q "X-Frame-Options"; then
    echo -e "${GREEN}✓ PASS${NC}"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (Missing headers)"
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
fi

# Check HTTPS redirect (if applicable)
if [ "$WEB_URL" != "http://localhost" ]; then
    printf "%-30s" "HTTPS Redirect..."
    http_response=$(curl -s -o /dev/null -w "%{http_code}" -L "${WEB_URL/https/http}" 2>/dev/null)
    if [ "$http_response" = "301" ] || [ "$http_response" = "200" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠ WARNING${NC} (No redirect)"
        CHECKS_WARNING=$((CHECKS_WARNING + 1))
    fi
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_WARNING))

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Total Checks: ${TOTAL_CHECKS}"
echo -e "${GREEN}Passed:  ${CHECKS_PASSED}${NC}"
echo -e "${YELLOW}Warnings: ${CHECKS_WARNING}${NC}"
echo -e "${RED}Failed:   ${CHECKS_FAILED}${NC}"
echo ""

# Exit code based on failures
if [ "$CHECKS_FAILED" -gt 0 ]; then
    echo -e "${RED}Status: CRITICAL - Action Required${NC}"
    exit 2
elif [ "$CHECKS_WARNING" -gt 0 ]; then
    echo -e "${YELLOW}Status: WARNING - Review Recommended${NC}"
    exit 1
else
    echo -e "${GREEN}Status: HEALTHY${NC}"
    exit 0
fi
