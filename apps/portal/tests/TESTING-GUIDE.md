# Portal Testing Guide

## Quick Start

### Run the Automated Test Suite

```bash
cd /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/portal/tests
./portal-test-suite.sh http://localhost:3001
```

### View Test Report

```bash
cat reports/portal-features-test-report.md
```

---

## Manual Testing Checklist

### 1. Authentication Tests

- [ ] Login with valid credentials
- [ ] Login with invalid credentials (should fail)
- [ ] Login with missing email (should fail)
- [ ] Login with missing password (should fail)
- [ ] Check session persistence (refresh page)
- [ ] Logout successfully
- [ ] Access protected route without token (should fail)
- [ ] Access with expired token (should fail)

**Test User Example:**

```bash
curl -X POST http://localhost:3001/api/portal/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@client.com","password":"testpass123"}'
```

---

### 2. Product Viewing Tests

- [ ] View all products
- [ ] Search for product by name
- [ ] Search for product by SKU
- [ ] Filter by stock status (LOW, CRITICAL, HEALTHY)
- [ ] View product details
- [ ] Check stock levels are visible
- [ ] Check usage trends are visible
- [ ] Verify on-order quantities shown
- [ ] Verify suggested order quantities calculated

**Test Example:**

```bash
# Get token first
TOKEN="your-jwt-token-here"

# List all products
curl -X GET http://localhost:3001/api/portal/products \
  -H "Authorization: Bearer $TOKEN"

# Search products
curl -X GET "http://localhost:3001/api/portal/products?search=widget" \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl -X GET "http://localhost:3001/api/portal/products?status=LOW" \
  -H "Authorization: Bearer $TOKEN"
```

---

### 3. Cart & Ordering Tests

- [ ] View empty cart
- [ ] Add item to cart
- [ ] Add multiple items to cart
- [ ] Update cart item quantity
- [ ] Remove item from cart
- [ ] Clear entire cart
- [ ] Submit cart as order
- [ ] Create direct order (bypass cart)
- [ ] View order list
- [ ] View order details
- [ ] View order status history
- [ ] Check order status display
- [ ] Verify SLA tracking

**Test Example:**

```bash
# Get cart
curl -X GET http://localhost:3001/api/portal/orders/cart \
  -H "Authorization: Bearer $TOKEN"

# Add to cart
curl -X POST http://localhost:3001/api/portal/orders/cart/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"product-uuid","quantityPacks":10}'

# Submit cart
curl -X POST http://localhost:3001/api/portal/orders/cart/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Test order"}'
```

---

### 4. Shipment Tracking Tests

- [ ] View all shipments
- [ ] View active shipments only
- [ ] View shipment statistics
- [ ] View shipment details
- [ ] View tracking events timeline
- [ ] Check tracking number visible
- [ ] Check carrier information visible
- [ ] Check estimated delivery date
- [ ] View shipments for specific order
- [ ] View order timing summary
- [ ] View upcoming deadlines

**Test Example:**

```bash
# List shipments
curl -X GET http://localhost:3001/api/portal/shipments \
  -H "Authorization: Bearer $TOKEN"

# Get active shipments
curl -X GET http://localhost:3001/api/portal/shipments/active \
  -H "Authorization: Bearer $TOKEN"

# Get tracking events
curl -X GET http://localhost:3001/api/portal/shipments/SHIPMENT_ID/events \
  -H "Authorization: Bearer $TOKEN"
```

---

### 5. Analytics Tests

- [ ] View stock velocity trends
- [ ] View usage trends (30 days)
- [ ] View risk products
- [ ] View analytics summary
- [ ] View location analytics
- [ ] View reorder suggestions
- [ ] Verify data is chart-ready (Recharts format)
- [ ] Check date formatting
- [ ] Check numeric values
- [ ] Verify trend calculations

**Test Example:**

```bash
# Stock velocity
curl -X GET http://localhost:3001/api/portal/analytics/stock-velocity \
  -H "Authorization: Bearer $TOKEN"

# Usage trends
curl -X GET "http://localhost:3001/api/portal/analytics/usage-trends?days=30" \
  -H "Authorization: Bearer $TOKEN"

# Summary dashboard
curl -X GET http://localhost:3001/api/portal/analytics/summary \
  -H "Authorization: Bearer $TOKEN"
```

---

### 6. Authorization & Security Tests

- [ ] Viewer role can view products
- [ ] Viewer role blocked from adding to cart
- [ ] Viewer role blocked from submitting orders
- [ ] Requester role can create orders
- [ ] Admin role has full access
- [ ] Cannot access other clients' data
- [ ] Unauthenticated requests blocked
- [ ] Invalid tokens rejected
- [ ] Expired tokens rejected
- [ ] Malformed requests validated

**Test Example:**

```bash
# Unauthenticated access (should fail)
curl -X GET http://localhost:3001/api/portal/products

# Invalid token (should fail)
curl -X GET http://localhost:3001/api/portal/products \
  -H "Authorization: Bearer invalid_token"

# Viewer role trying to add to cart (should fail with 403)
curl -X POST http://localhost:3001/api/portal/orders/cart/items \
  -H "Authorization: Bearer $VIEWER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"uuid","quantityPacks":10}'
```

---

## Data Isolation Verification

### Test with Multiple Clients

1. Create two test portal users for different clients
2. Login as Client A user, get token
3. Login as Client B user, get token
4. Verify Client A can only see their products
5. Verify Client B can only see their products
6. Try to access Client B's product with Client A's token (should fail)

```bash
# Login as Client A
CLIENT_A_TOKEN=$(curl -s -X POST http://localhost:3001/api/portal/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clienta@test.com","password":"password"}' \
  | jq -r '.accessToken')

# Login as Client B
CLIENT_B_TOKEN=$(curl -s -X POST http://localhost:3001/api/portal/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clientb@test.com","password":"password"}' \
  | jq -r '.accessToken')

# Get Client A's products
curl -X GET http://localhost:3001/api/portal/products \
  -H "Authorization: Bearer $CLIENT_A_TOKEN"

# Try to access Client B's product with Client A's token (should return 404)
curl -X GET http://localhost:3001/api/portal/products/CLIENT_B_PRODUCT_ID \
  -H "Authorization: Bearer $CLIENT_A_TOKEN"
```

---

## Recharts Integration Verification

### Verify Chart Data Format

All analytics endpoints should return data compatible with Recharts:

**Requirements:**

- Array of objects
- Consistent property names
- Numeric values for Y-axis
- Date/category values for X-axis
- No null values in critical fields

**Example Test:**

```bash
# Get usage trends
response=$(curl -s -X GET "http://localhost:3001/api/portal/analytics/usage-trends?days=7" \
  -H "Authorization: Bearer $TOKEN")

# Verify format
echo "$response" | jq '.data[] | {date, units, packs}'

# Expected format:
# {
#   "date": "2024-01-15",
#   "units": 150,
#   "packs": 15
# }
```

---

## Performance Testing

### Response Time Benchmarks

```bash
# Test authentication speed (target: < 200ms)
time curl -s -X POST http://localhost:3001/api/portal/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@client.com","password":"password"}' > /dev/null

# Test product list speed (target: < 500ms)
time curl -s -X GET http://localhost:3001/api/portal/products \
  -H "Authorization: Bearer $TOKEN" > /dev/null

# Test analytics speed (target: < 2000ms)
time curl -s -X GET http://localhost:3001/api/portal/analytics/summary \
  -H "Authorization: Bearer $TOKEN" > /dev/null
```

### Load Testing

Use Apache Bench for concurrent requests:

```bash
# 100 requests, 10 concurrent
ab -n 100 -c 10 \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/portal/products
```

---

## Common Issues & Troubleshooting

### Issue: "Server not running"

**Solution:**

```bash
cd /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/api
npm run dev
```

### Issue: "Invalid credentials"

**Solution:**
Ensure test user exists in database:

```sql
SELECT * FROM "PortalUser" WHERE email = 'test@client.com';
```

### Issue: "No products returned"

**Solution:**
Seed database with test data:

```bash
cd /Users/aerialshotsmedia/Projects/fulfillment-ops-dashboard/apps/api
npm run db:seed
```

### Issue: "CORS error"

**Solution:**
Check environment variables:

```bash
# In .env file
PORTAL_URL=http://localhost:5174
WEB_URL=http://localhost:5173
```

### Issue: "Token expired"

**Solution:**
Login again to get new token:

```bash
curl -X POST http://localhost:3001/api/portal/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@client.com","password":"password"}'
```

---

## Testing Best Practices

1. **Always test with authentication first**
   - Get a valid token before testing protected endpoints

2. **Test error cases**
   - Invalid inputs
   - Missing required fields
   - Unauthorized access

3. **Verify data isolation**
   - Create multiple test clients
   - Ensure no cross-client data leakage

4. **Check response formats**
   - Verify JSON structure
   - Check for required fields
   - Validate data types

5. **Test pagination**
   - Request with different limits
   - Verify page counts
   - Check offset behavior

6. **Monitor performance**
   - Track response times
   - Identify slow endpoints
   - Optimize as needed

---

## Automated Testing with Newman (Postman)

### Export Postman Collection

1. Create collection with all endpoints
2. Add authentication
3. Add test assertions
4. Export as JSON

### Run with Newman

```bash
npm install -g newman
newman run portal-tests.postman_collection.json \
  --environment portal-test.postman_environment.json
```

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Portal API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: "18"
      - name: Install dependencies
        run: npm install
      - name: Start database
        run: docker-compose up -d postgres redis
      - name: Run migrations
        run: npm run db:migrate
      - name: Seed test data
        run: npm run db:seed
      - name: Start API server
        run: npm run dev &
      - name: Wait for server
        run: sleep 10
      - name: Run tests
        run: ./apps/portal/tests/portal-test-suite.sh
```

---

## Security Checklist

- [ ] HTTPS enabled in production
- [ ] JWT secret is strong (32+ characters)
- [ ] Passwords hashed with bcrypt
- [ ] HttpOnly cookies used
- [ ] CORS restricted to known origins
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention (Prisma)
- [ ] XSS prevention (sanitized outputs)
- [ ] CSRF protection (SameSite cookies)
- [ ] Security headers set (Helmet)
- [ ] Error messages don't leak sensitive info
- [ ] Database credentials secured
- [ ] API keys not in code

---

## Test Data Setup

### Create Test Portal User

```sql
-- Create test client
INSERT INTO "Client" (id, name, code, "isActive")
VALUES ('test-client-id', 'Test Client', 'TEST', true);

-- Create test portal user (password: testpass123)
INSERT INTO "PortalUser" (id, email, "passwordHash", name, "clientId", role)
VALUES (
  'test-user-id',
  'test@client.com',
  '$2a$10$YourHashedPasswordHere',
  'Test User',
  'test-client-id',
  'requester'
);
```

### Hash Password

```javascript
const bcrypt = require("bcryptjs");
const hash = await bcrypt.hash("testpass123", 10);
console.log(hash);
```

---

## Appendix: Full Test Suite Output

Expected output from successful test run:

```
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║          PORTAL FEATURES COMPREHENSIVE TEST SUITE              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝

API URL: http://localhost:3001
Report: ./reports/portal-features-test-report.md

========================================
0. API HEALTH CHECK
========================================

TEST: API server availability
✓ PASS: API server is running

========================================
1. PORTAL AUTHENTICATION TESTS
========================================

TEST: 1.1 - Login with invalid credentials (should fail)
✓ PASS: Invalid login correctly rejected

TEST: 1.2 - Login with missing fields (should fail)
✓ PASS: Missing fields validation working

TEST: 1.3 - Valid login attempt
✓ PASS: Valid login successful, token received

TEST: 1.4 - Get current user session
✓ PASS: Session validation working

TEST: 1.5 - Invalid token rejection
✓ PASS: Invalid token correctly rejected

TEST: 1.6 - Logout functionality
✓ PASS: Logout successful

========================================
2. PRODUCT VIEWING TESTS
========================================

TEST: 2.1 - Get client products
✓ PASS: Products list retrieved
✓ PASS: Product data contains required fields

TEST: 2.2 - Product search
✓ PASS: Product search working

TEST: 2.3 - Product status filter
✓ PASS: Status filter working

TEST: 2.4 - Get product details
✓ PASS: Product details retrieved with history

========================================
TEST SUMMARY
========================================

Total Tests: 45
Passed: 45
Failed: 0

✓ ALL TESTS PASSED
```

---

**Last Updated:** December 15, 2024
**Version:** 1.0
