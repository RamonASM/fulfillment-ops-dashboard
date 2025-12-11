# API Documentation

Base URL: `http://localhost:3001/api`

## Authentication

All protected endpoints require a valid JWT token in cookies or Authorization header.

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "sarah.chen@inventoryiq.com",
  "password": "demo123"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "sarah.chen@inventoryiq.com",
    "name": "Sarah Chen",
    "role": "account_manager"
  },
  "accessToken": "jwt-token"
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>
```

### Logout
```http
POST /auth/logout
```

---

## Clients

### List Clients
```http
GET /clients
Authorization: Bearer <token>
```

**Response:**
```json
{
  "clients": [
    {
      "id": "uuid",
      "name": "Acme Corporation",
      "code": "ACME",
      "settings": {
        "reorderLeadDays": 14,
        "safetyStockWeeks": 2
      },
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Get Client Summary
```http
GET /clients/:clientId/summary
Authorization: Bearer <token>
```

**Response:**
```json
{
  "client": {
    "id": "uuid",
    "name": "Acme Corporation",
    "code": "ACME"
  },
  "metrics": {
    "totalProducts": 7,
    "healthyProducts": 4,
    "watchProducts": 1,
    "lowProducts": 1,
    "criticalProducts": 0,
    "stockoutProducts": 1,
    "overallHealth": 78.5
  },
  "alerts": {
    "total": 2,
    "unread": 1,
    "critical": 1,
    "warning": 1
  }
}
```

---

## Products

### List Products
```http
GET /clients/:clientId/products
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page |
| sort | string | -weeksRemaining | Sort field (prefix with - for desc) |
| status | string | | Filter by status (comma-separated) |
| type | string | | Filter by itemType |
| search | string | | Search by productId or name |

**Response:**
```json
{
  "products": [
    {
      "id": "uuid",
      "productId": "ACME-001",
      "name": "Business Cards - Standard",
      "packSize": 500,
      "currentStockPacks": 150,
      "currentStockUnits": 75000,
      "reorderPointPacks": 30,
      "status": {
        "level": "healthy",
        "label": "Healthy",
        "color": "#10B981",
        "weeksRemaining": 12
      },
      "usage": {
        "avgDailyUnits": 25,
        "avgWeeklyUnits": 175,
        "avgMonthlyUnits": 750
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 7,
    "totalPages": 1
  }
}
```

### Get Product Detail
```http
GET /clients/:clientId/products/:productId
Authorization: Bearer <token>
```

### Create Product
```http
POST /clients/:clientId/products
Authorization: Bearer <token>
Content-Type: application/json

{
  "productId": "ACME-008",
  "name": "New Product",
  "packSize": 100,
  "itemType": "evergreen",
  "currentStockPacks": 50
}
```

### Update Product
```http
PATCH /clients/:clientId/products/:productId
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentStockPacks": 75,
  "notificationPoint": 20
}
```

---

## Imports

### Analyze File
```http
POST /imports/analyze
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <csv or xlsx file>
clientId: <client-uuid>
```

**Response:**
```json
{
  "fileType": "inventory",
  "confidence": 0.95,
  "headers": ["Product ID", "Name", "Qty Available", "Pack Size"],
  "mapping": [
    {
      "sourceColumn": "Product ID",
      "mapsTo": "productId",
      "confidence": 1.0
    },
    {
      "sourceColumn": "Qty Available",
      "mapsTo": "currentStockPacks",
      "confidence": 0.9
    }
  ],
  "preview": [
    {"Product ID": "ACME-001", "Name": "Business Cards", "Qty Available": 150}
  ]
}
```

### Process Import
```http
POST /imports/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "clientId": "uuid",
  "fileType": "inventory",
  "mapping": [
    {"sourceColumn": "Product ID", "mapsTo": "productId"},
    {"sourceColumn": "Qty Available", "mapsTo": "currentStockPacks"}
  ],
  "rows": [
    {"Product ID": "ACME-001", "Qty Available": 150}
  ]
}
```

---

## Alerts

### List Alerts
```http
GET /clients/:clientId/alerts
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | active | Filter: active, read, dismissed |
| severity | string | | Filter: critical, warning, info |
| limit | number | 50 | Items per page |

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "alertType": "stockout",
      "severity": "critical",
      "status": "active",
      "title": "STOCKOUT: Notepads - Custom",
      "message": "Stock level requires immediate attention.",
      "productId": "uuid",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Mark Alert as Read
```http
PATCH /clients/:clientId/alerts/:alertId
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "read"
}
```

---

## AI Features

### Get Risk Scores
```http
GET /ai/risk/:clientId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "products": [
    {
      "productId": "uuid",
      "productName": "Notepads - Custom",
      "riskScore": 95,
      "riskLevel": "critical",
      "factors": {
        "stockLevel": 40,
        "usageVelocity": 25,
        "volatility": 15,
        "leadTime": 15
      }
    }
  ]
}
```

### Get Demand Forecast
```http
GET /ai/forecast/:productId
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| weeks | number | 8 | Forecast horizon in weeks |

**Response:**
```json
{
  "productId": "uuid",
  "forecast": [
    {"week": 1, "predicted": 175, "lower": 150, "upper": 200},
    {"week": 2, "predicted": 180, "lower": 155, "upper": 205}
  ],
  "confidence": 0.85,
  "method": "weighted_average"
}
```

### Detect Anomalies
```http
GET /ai/anomalies/client/:clientId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "anomalies": [
    {
      "productId": "uuid",
      "productName": "Business Cards",
      "anomalyType": "usage_spike",
      "severity": "medium",
      "description": "Usage 45% above expected",
      "currentValue": 250,
      "expectedValue": 175,
      "deviation": 0.43
    }
  ]
}
```

### Get Seasonal Patterns
```http
GET /ai/seasonal/client/:clientId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "patterns": [
    {
      "productId": "uuid",
      "productName": "Brochures",
      "patternType": "quarterly",
      "confidence": 0.82,
      "seasonalFactors": {
        "Q1": 0.85,
        "Q2": 0.95,
        "Q3": 0.90,
        "Q4": 1.30
      },
      "peakPeriod": "Q4",
      "troughPeriod": "Q1"
    }
  ]
}
```

### Generate Communication Drafts
```http
GET /ai/drafts/:clientId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "drafts": [
    {
      "type": "reorder_alert",
      "subject": "Action Required: Low Stock Items for Acme Corporation",
      "body": "Dear Acme Team,\n\nWe've identified 2 products that require attention...",
      "urgency": "high",
      "suggestedSendTime": "2024-01-16T09:00:00Z",
      "productIds": ["uuid1", "uuid2"]
    }
  ]
}
```

---

## Portal API

Portal endpoints use `/api/portal` prefix and require portal user authentication.

### Portal Login
```http
POST /portal/auth/login
Content-Type: application/json

{
  "email": "john.doe@acmecorp.com",
  "password": "client123"
}
```

### Portal Dashboard
```http
GET /portal/dashboard
Authorization: Bearer <token>
```

### Portal Products
```http
GET /portal/products
Authorization: Bearer <token>
```

### Create Order Request
```http
POST /portal/orders/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {"productId": "uuid", "quantity": 50},
    {"productId": "uuid", "quantity": 25}
  ],
  "notes": "Quarterly restock"
}
```

### Get Order History
```http
GET /portal/orders
Authorization: Bearer <token>
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {"field": "email", "message": "Invalid email format"}
    ]
  }
}
```

**Common Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| INTERNAL_ERROR | 500 | Server error |
