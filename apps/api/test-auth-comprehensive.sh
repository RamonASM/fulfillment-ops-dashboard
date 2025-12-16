#!/bin/bash

# Comprehensive Authentication and User Management Testing Script
# Tests all authentication, user management, and user preferences features

BASE_URL="http://localhost:3001"
API_URL="$BASE_URL/api"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Output file
OUTPUT_FILE="/tmp/auth_test_results.txt"
> "$OUTPUT_FILE"

# Function to print test result
print_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ "$status" = "PASS" ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        echo "✓ PASS: $test_name" >> "$OUTPUT_FILE"
    elif [ "$status" = "FAIL" ]; then
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo "✗ FAIL: $test_name" >> "$OUTPUT_FILE"
    else
        echo -e "${YELLOW}⚠ WARN${NC}: $test_name"
        echo "⚠ WARN: $test_name" >> "$OUTPUT_FILE"
    fi

    if [ -n "$details" ]; then
        echo "  Details: $details"
        echo "  Details: $details" >> "$OUTPUT_FILE"
    fi
    echo "" >> "$OUTPUT_FILE"
}

# Function to make API request
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local token="$4"

    if [ -n "$token" ]; then
        if [ -n "$data" ]; then
            curl -s -X "$method" "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $token" \
                -b "accessToken=$token" \
                -d "$data"
        else
            curl -s -X "$method" "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $token" \
                -b "accessToken=$token"
        fi
    else
        if [ -n "$data" ]; then
            curl -s -X "$method" "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data"
        else
            curl -s -X "$method" "$API_URL$endpoint" \
                -H "Content-Type: application/json"
        fi
    fi
}

# Function to extract JSON field
extract_json() {
    echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | cut -d'"' -f4
}

echo "=========================================="
echo "Authentication & User Management Tests"
echo "=========================================="
echo ""

# =============================================================================
# 1. AUTHENTICATION TESTS
# =============================================================================

echo "=== 1. AUTHENTICATION TESTS ==="
echo ""

# Test 1.1: Login with invalid credentials
echo "Test 1.1: Login with invalid credentials"
RESPONSE=$(api_request "POST" "/auth/login" '{"email":"invalid@test.com","password":"wrongpassword"}')
if echo "$RESPONSE" | grep -q "Invalid email or password"; then
    print_result "Login with invalid credentials" "PASS" "Returns 401 error"
else
    print_result "Login with invalid credentials" "FAIL" "Response: $RESPONSE"
fi

# Test 1.2: Login with missing password
echo "Test 1.2: Login with missing password"
RESPONSE=$(api_request "POST" "/auth/login" '{"email":"test@test.com"}')
if echo "$RESPONSE" | grep -q "error"; then
    print_result "Login with missing password" "PASS" "Returns validation error"
else
    print_result "Login with missing password" "FAIL" "Response: $RESPONSE"
fi

# Test 1.3: Login with short password
echo "Test 1.3: Login with short password"
RESPONSE=$(api_request "POST" "/auth/login" '{"email":"test@test.com","password":"short"}')
if echo "$RESPONSE" | grep -q "at least 8 characters"; then
    print_result "Login with short password" "PASS" "Returns password length error"
else
    print_result "Login with short password" "FAIL" "Response: $RESPONSE"
fi

# Test 1.4: Login with invalid email format
echo "Test 1.4: Login with invalid email format"
RESPONSE=$(api_request "POST" "/auth/login" '{"email":"notanemail","password":"testpass123"}')
if echo "$RESPONSE" | grep -q "Invalid email"; then
    print_result "Login with invalid email format" "PASS" "Returns email validation error"
else
    print_result "Login with invalid email format" "FAIL" "Response: $RESPONSE"
fi

# Test 1.5: Get /me without authentication
echo "Test 1.5: Access /me endpoint without authentication"
RESPONSE=$(api_request "GET" "/auth/me")
if echo "$RESPONSE" | grep -q "No authentication token"; then
    print_result "Access protected endpoint without auth" "PASS" "Returns 401 error"
else
    print_result "Access protected endpoint without auth" "FAIL" "Response: $RESPONSE"
fi

# Test 1.6: Refresh token without token
echo "Test 1.6: Refresh token without providing token"
RESPONSE=$(api_request "POST" "/auth/refresh")
if echo "$RESPONSE" | grep -q "No refresh token"; then
    print_result "Refresh without token" "PASS" "Returns error"
else
    print_result "Refresh without token" "FAIL" "Response: $RESPONSE"
fi

# Test 1.7: Logout
echo "Test 1.7: Logout endpoint"
RESPONSE=$(api_request "POST" "/auth/logout")
if echo "$RESPONSE" | grep -q "Logged out successfully"; then
    print_result "Logout" "PASS" "Returns success message"
else
    print_result "Logout" "FAIL" "Response: $RESPONSE"
fi

# =============================================================================
# 2. PASSWORD RESET TESTS
# =============================================================================

echo ""
echo "=== 2. PASSWORD RESET TESTS ==="
echo ""

# Test 2.1: Request password reset with missing email
echo "Test 2.1: Request password reset with missing email"
RESPONSE=$(api_request "POST" "/auth/forgot-password" '{"userType":"admin"}')
if echo "$RESPONSE" | grep -q "error"; then
    print_result "Password reset without email" "PASS" "Returns validation error"
else
    print_result "Password reset without email" "FAIL" "Response: $RESPONSE"
fi

# Test 2.2: Request password reset with invalid email
echo "Test 2.2: Request password reset with invalid email"
RESPONSE=$(api_request "POST" "/auth/forgot-password" '{"email":"notanemail","userType":"admin"}')
if echo "$RESPONSE" | grep -q "Invalid email"; then
    print_result "Password reset with invalid email" "PASS" "Returns validation error"
else
    print_result "Password reset with invalid email" "FAIL" "Response: $RESPONSE"
fi

# Test 2.3: Request password reset with missing user type
echo "Test 2.3: Request password reset without user type"
RESPONSE=$(api_request "POST" "/auth/forgot-password" '{"email":"test@test.com"}')
if echo "$RESPONSE" | grep -q "error"; then
    print_result "Password reset without user type" "PASS" "Returns validation error"
else
    print_result "Password reset without user type" "FAIL" "Response: $RESPONSE"
fi

# Test 2.4: Request password reset for non-existent user (should return success to prevent enumeration)
echo "Test 2.4: Request password reset for non-existent user"
RESPONSE=$(api_request "POST" "/auth/forgot-password" '{"email":"nonexistent@test.com","userType":"admin"}')
if echo "$RESPONSE" | grep -q "If an account exists"; then
    print_result "Password reset for non-existent user" "PASS" "Returns generic success (prevents enumeration)"
else
    print_result "Password reset for non-existent user" "FAIL" "Response: $RESPONSE"
fi

# Test 2.5: Verify reset token without token
echo "Test 2.5: Verify reset token without providing token"
RESPONSE=$(api_request "POST" "/auth/verify-reset-token" '{}')
if echo "$RESPONSE" | grep -q "error"; then
    print_result "Verify reset token without token" "PASS" "Returns validation error"
else
    print_result "Verify reset token without token" "FAIL" "Response: $RESPONSE"
fi

# Test 2.6: Verify invalid reset token
echo "Test 2.6: Verify invalid reset token"
RESPONSE=$(api_request "POST" "/auth/verify-reset-token" '{"token":"invalid-token-12345"}')
if echo "$RESPONSE" | grep -q "Invalid or expired"; then
    print_result "Verify invalid reset token" "PASS" "Returns error"
else
    print_result "Verify invalid reset token" "FAIL" "Response: $RESPONSE"
fi

# Test 2.7: Reset password without token
echo "Test 2.7: Reset password without token"
RESPONSE=$(api_request "POST" "/auth/reset-password" '{"password":"newpassword123"}')
if echo "$RESPONSE" | grep -q "error"; then
    print_result "Reset password without token" "PASS" "Returns validation error"
else
    print_result "Reset password without token" "FAIL" "Response: $RESPONSE"
fi

# Test 2.8: Reset password with short password
echo "Test 2.8: Reset password with short password"
RESPONSE=$(api_request "POST" "/auth/reset-password" '{"token":"sometoken","password":"short"}')
if echo "$RESPONSE" | grep -q "at least 8 characters"; then
    print_result "Reset password with short password" "PASS" "Returns validation error"
else
    print_result "Reset password with short password" "FAIL" "Response: $RESPONSE"
fi

# =============================================================================
# 3. USER PREFERENCES TESTS (without authentication - should fail)
# =============================================================================

echo ""
echo "=== 3. USER PREFERENCES TESTS (Unauthenticated) ==="
echo ""

# Test 3.1: Get preferences without auth
echo "Test 3.1: Get preferences without authentication"
RESPONSE=$(api_request "GET" "/preferences")
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "Get preferences without auth" "PASS" "Returns 401 error"
else
    print_result "Get preferences without auth" "FAIL" "Response: $RESPONSE"
fi

# Test 3.2: Update preferences without auth
echo "Test 3.2: Update preferences without authentication"
RESPONSE=$(api_request "PATCH" "/preferences" '{"theme":"dark"}')
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "Update preferences without auth" "PASS" "Returns 401 error"
else
    print_result "Update preferences without auth" "FAIL" "Response: $RESPONSE"
fi

# Test 3.3: Get layouts without auth
echo "Test 3.3: Get layouts without authentication"
RESPONSE=$(api_request "GET" "/preferences/layouts")
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "Get layouts without auth" "PASS" "Returns 401 error"
else
    print_result "Get layouts without auth" "FAIL" "Response: $RESPONSE"
fi

# =============================================================================
# 4. USER MANAGEMENT TESTS (without authentication - should fail)
# =============================================================================

echo ""
echo "=== 4. USER MANAGEMENT TESTS (Unauthenticated) ==="
echo ""

# Test 4.1: List users without auth
echo "Test 4.1: List users without authentication"
RESPONSE=$(api_request "GET" "/users")
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "List users without auth" "PASS" "Returns 401 error"
else
    print_result "List users without auth" "FAIL" "Response: $RESPONSE"
fi

# Test 4.2: Create user without auth
echo "Test 4.2: Create user without authentication"
RESPONSE=$(api_request "POST" "/users" '{"email":"test@test.com","password":"testpass123","name":"Test User"}')
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "Create user without auth" "PASS" "Returns 401 error"
else
    print_result "Create user without auth" "FAIL" "Response: $RESPONSE"
fi

# =============================================================================
# 5. RATE LIMITING TESTS
# =============================================================================

echo ""
echo "=== 5. RATE LIMITING TESTS ==="
echo ""

# Test 5.1: Check rate limiting headers are present
echo "Test 5.1: Check rate limiting headers"
HEADERS=$(curl -s -i "$API_URL/auth/logout" 2>&1)
if echo "$HEADERS" | grep -qi "ratelimit"; then
    print_result "Rate limiting headers present" "PASS" "Headers found"
else
    print_result "Rate limiting headers present" "WARN" "Headers may not be visible in dev mode"
fi

# =============================================================================
# 6. PORTAL USER TESTS (without authentication - should fail)
# =============================================================================

echo ""
echo "=== 6. PORTAL USER TESTS (Unauthenticated) ==="
echo ""

# Test 6.1: List portal users without auth
echo "Test 6.1: List portal users without authentication"
RESPONSE=$(api_request "GET" "/users/portal")
if echo "$RESPONSE" | grep -q "authentication\|token"; then
    print_result "List portal users without auth" "PASS" "Returns 401 error"
else
    print_result "List portal users without auth" "FAIL" "Response: $RESPONSE"
fi

# Test 6.2: Portal user login with missing credentials
echo "Test 6.2: Portal user login with missing credentials"
RESPONSE=$(api_request "POST" "/portal/auth/login" '{}')
if echo "$RESPONSE" | grep -q "required"; then
    print_result "Portal login without credentials" "PASS" "Returns validation error"
else
    print_result "Portal login without credentials" "FAIL" "Response: $RESPONSE"
fi

# Test 6.3: Portal user login with invalid credentials
echo "Test 6.3: Portal user login with invalid credentials"
RESPONSE=$(api_request "POST" "/portal/auth/login" '{"email":"fake@test.com","password":"wrongpass"}')
if echo "$RESPONSE" | grep -q "Invalid credentials"; then
    print_result "Portal login with invalid credentials" "PASS" "Returns 401 error"
else
    print_result "Portal login with invalid credentials" "FAIL" "Response: $RESPONSE"
fi

# Test 6.4: Portal /me without auth
echo "Test 6.4: Portal /me without authentication"
RESPONSE=$(api_request "GET" "/portal/auth/me")
if echo "$RESPONSE" | grep -q "Not authenticated"; then
    print_result "Portal /me without auth" "PASS" "Returns 401 error"
else
    print_result "Portal /me without auth" "FAIL" "Response: $RESPONSE"
fi

# =============================================================================
# 7. SECURITY TESTS
# =============================================================================

echo ""
echo "=== 7. SECURITY TESTS ==="
echo ""

# Test 7.1: Check security headers
echo "Test 7.1: Check security headers (Helmet)"
HEADERS=$(curl -s -i "$BASE_URL/health" 2>&1)
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
    print_result "Security headers present" "PASS" "Helmet headers found"
else
    print_result "Security headers present" "FAIL" "Missing security headers"
fi

# Test 7.2: Check CORS headers
echo "Test 7.2: Check CORS configuration"
HEADERS=$(curl -s -i -H "Origin: http://localhost:5173" "$BASE_URL/health" 2>&1)
if echo "$HEADERS" | grep -qi "access-control-allow-origin"; then
    print_result "CORS headers configured" "PASS" "CORS enabled"
else
    print_result "CORS headers configured" "WARN" "CORS headers not found"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""
echo "Pass Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
echo ""
echo "Results saved to: $OUTPUT_FILE"
