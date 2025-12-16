# Authentication & User Management - Quick Reference Guide

**Last Updated**: 2025-12-15
**API Version**: 1.0.0

---

## Table of Contents

1. [Authentication Endpoints](#authentication-endpoints)
2. [User Management Endpoints](#user-management-endpoints)
3. [Password Reset Flow](#password-reset-flow)
4. [User Preferences](#user-preferences)
5. [Security Configuration](#security-configuration)
6. [Role Permissions](#role-permissions)
7. [Common Examples](#common-examples)

---

## Authentication Endpoints

### Admin User Login

**POST** `/api/auth/login`

**Request**:

```json
{
  "email": "admin@example.com",
  "password": "securepassword123"
}
```

**Response** (200 OK):

```json
{
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Cookies Set**:

- `accessToken` (15 minutes, HTTP-only)
- `refreshToken` (7 days, HTTP-only)

---

### Get Current User

**GET** `/api/auth/me`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Response** (200 OK):

```json
{
  "id": "uuid",
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "admin",
  "settings": {},
  "clients": [
    {
      "id": "client-uuid",
      "name": "Client Name",
      "code": "CLI001",
      "role": "manager"
    }
  ]
}
```

---

### Refresh Access Token

**POST** `/api/auth/refresh`

**Requires**: `refreshToken` cookie

**Response** (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### Logout

**POST** `/api/auth/logout`

**Response** (200 OK):

```json
{
  "message": "Logged out successfully"
}
```

**Effect**: Clears `accessToken` and `refreshToken` cookies

---

## User Management Endpoints

### List All Users (Admin Only)

**GET** `/api/users`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Response** (200 OK):

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "account_manager",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "lastLoginAt": "2025-01-15T10:30:00.000Z",
      "clients": [...]
    }
  ]
}
```

---

### Create User (Admin Only)

**POST** `/api/users`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Request**:

```json
{
  "email": "newuser@example.com",
  "password": "securepass123",
  "name": "New User",
  "role": "account_manager"
}
```

**Response** (201 Created):

```json
{
  "data": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "account_manager",
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00.000Z"
  },
  "message": "User created successfully"
}
```

---

### Update User (Admin Only)

**PUT** `/api/users/:id`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Request** (all fields optional):

```json
{
  "name": "Updated Name",
  "role": "operations_manager",
  "isActive": false,
  "password": "newpassword123"
}
```

**Response** (200 OK):

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Updated Name",
    "role": "operations_manager",
    "isActive": false,
    "updatedAt": "2025-01-15T11:00:00.000Z"
  },
  "message": "User updated successfully"
}
```

---

### Assign Clients to User (Admin Only)

**POST** `/api/users/:id/clients`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Request**:

```json
{
  "clientIds": ["client-uuid-1", "client-uuid-2"]
}
```

**Response** (200 OK):

```json
{
  "message": "Client assignments updated"
}
```

---

## Portal User Management

### List Portal Users (Admin/Account Manager)

**GET** `/api/users/portal?clientId={optional}`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Response** (200 OK):

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "portal@example.com",
      "name": "Portal User",
      "role": "admin",
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "client": {
        "id": "client-uuid",
        "name": "Client Name",
        "code": "CLI001"
      }
    }
  ]
}
```

---

### Create Portal User (Admin/Account Manager)

**POST** `/api/users/portal`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Request**:

```json
{
  "email": "portal@example.com",
  "password": "securepass123",
  "name": "Portal User",
  "clientId": "client-uuid",
  "role": "viewer"
}
```

**Roles**: `admin`, `manager`, `viewer`

---

### Portal User Login

**POST** `/api/portal/auth/login`

**Request**:

```json
{
  "email": "portal@example.com",
  "password": "securepassword123"
}
```

**Response** (200 OK):

```json
{
  "user": {
    "id": "uuid",
    "email": "portal@example.com",
    "name": "Portal User",
    "clientId": "client-uuid",
    "clientName": "Client Name",
    "role": "admin"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Cookies Set**: `portal_token` (7 days, HTTP-only)

---

### Portal User - Get Current User

**GET** `/api/portal/auth/me`

**Headers**:

```
Authorization: Bearer {accessToken}
```

OR Cookie: `portal_token`

**Response** (200 OK):

```json
{
  "id": "uuid",
  "email": "portal@example.com",
  "name": "Portal User",
  "clientId": "client-uuid",
  "clientName": "Client Name",
  "role": "admin"
}
```

---

## Password Reset Flow

### Step 1: Request Password Reset

**POST** `/api/auth/forgot-password`

**Request**:

```json
{
  "email": "user@example.com",
  "userType": "admin"
}
```

**userType**: `admin` or `portal`

**Response** (200 OK):

```json
{
  "message": "If an account exists with this email, a reset link has been sent.",
  "debug": {
    "token": "abc123...",
    "resetUrl": "https://admin.example.com/reset-password?token=abc123...",
    "expiresAt": "2025-01-15T11:30:00.000Z"
  }
}
```

**Note**: `debug` field only included in development mode

---

### Step 2: Verify Reset Token (Optional)

**POST** `/api/auth/verify-reset-token`

**Request**:

```json
{
  "token": "abc123..."
}
```

**Response** (200 OK):

```json
{
  "valid": true,
  "email": "user@example.com",
  "userType": "admin"
}
```

**Response** (400 Bad Request) if invalid:

```json
{
  "valid": false,
  "message": "Invalid or expired reset link"
}
```

---

### Step 3: Reset Password

**POST** `/api/auth/reset-password`

**Request**:

```json
{
  "token": "abc123...",
  "password": "newsecurepass123"
}
```

**Response** (200 OK):

```json
{
  "message": "Password has been reset successfully"
}
```

**Token Invalidation**: Token is marked as used and cannot be reused

---

## User Preferences

### Get Preferences

**GET** `/api/preferences`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "user-uuid",
    "defaultView": "dashboard",
    "chartColorScheme": "default",
    "compactMode": false,
    "enableRealtime": true,
    "notificationSettings": {
      "emailAlerts": true,
      "desktopNotifications": true,
      "alertTypes": ["critical", "warning"]
    },
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Note**: Creates default preferences if none exist

---

### Update Preferences

**PATCH** `/api/preferences`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Request** (all fields optional):

```json
{
  "defaultView": "analytics",
  "chartColorScheme": "dark",
  "compactMode": true,
  "enableRealtime": false,
  "notificationSettings": {
    "emailAlerts": false,
    "desktopNotifications": true,
    "alertTypes": ["critical"],
    "quietHoursStart": "22:00",
    "quietHoursEnd": "08:00"
  }
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    // Updated preferences object
  }
}
```

---

### Reset Preferences to Defaults

**POST** `/api/preferences/reset`

**Headers**:

```
Authorization: Bearer {accessToken}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    // Default preferences object
  }
}
```

---

### Dashboard Layouts

#### Get All Layouts

**GET** `/api/preferences/layouts`

**Response** (200 OK):

```json
{
  "success": true,
  "data": [
    {
      "id": "layout-uuid",
      "userId": "user-uuid",
      "name": "My Custom Layout",
      "isDefault": true,
      "layout": [
        {
          "i": "kpi-cards",
          "x": 0,
          "y": 0,
          "w": 12,
          "h": 2
        }
      ],
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

---

#### Get Default Layout

**GET** `/api/preferences/layouts/default`

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "layout": [
      { "i": "kpi-cards", "x": 0, "y": 0, "w": 12, "h": 2 },
      { "i": "stock-health", "x": 0, "y": 2, "w": 4, "h": 3 },
      { "i": "monthly-trends", "x": 4, "y": 2, "w": 8, "h": 3 }
    ],
    "isDefault": true,
    "name": "Default"
  }
}
```

---

#### Create Layout

**POST** `/api/preferences/layouts`

**Request**:

```json
{
  "name": "My Layout",
  "isDefault": true,
  "layout": [
    {
      "i": "kpi-cards",
      "x": 0,
      "y": 0,
      "w": 12,
      "h": 2,
      "minW": 6,
      "minH": 2
    }
  ]
}
```

**Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "id": "layout-uuid"
    // ... layout object
  }
}
```

---

#### Update Layout

**PATCH** `/api/preferences/layouts/:layoutId`

**Request**:

```json
{
  "name": "Updated Name",
  "layout": [...],
  "isDefault": true
}
```

---

#### Delete Layout

**DELETE** `/api/preferences/layouts/:layoutId`

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Layout deleted"
}
```

---

#### Set Default Layout

**POST** `/api/preferences/layouts/:layoutId/set-default`

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Layout set as default"
}
```

---

## Security Configuration

### JWT Tokens

**Access Token**:

- Expiry: 15 minutes
- Storage: HTTP-only cookie + response body
- Used for: API authentication

**Refresh Token**:

- Expiry: 7 days
- Storage: HTTP-only cookie
- Used for: Refreshing access token

**Token Payload**:

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "admin",
  "iat": 1234567890,
  "exp": 1234567890
}
```

---

### Password Security

- **Hashing**: bcrypt with 12 rounds
- **Minimum Length**: 8 characters
- **Storage**: Never stored in plaintext
- **Reset Tokens**: 32-byte random hex (256-bit), 1-hour expiry

---

### Rate Limiting

| Endpoint Type  | Production Limit | Dev/Test Limit |
| -------------- | ---------------- | -------------- |
| General API    | 100 req/min      | 10,000 req/min |
| Authentication | 10 req/15min     | 1,000 req/min  |
| File Upload    | 20 req/hour      | 500 req/hour   |
| AI/Analytics   | 30 req/min       | 500 req/min    |
| Reports        | 10 req/5min      | 100 req/5min   |

---

### CSRF Protection

**Implementation**: Double-submit cookie pattern

**Get CSRF Token**:

```bash
GET /api/csrf-token
```

**Using CSRF Token**:

```bash
# Include in both header and cookie
X-CSRF-Token: {token}
Cookie: csrf_token={token}
```

**Exempt Endpoints**:

- GET, HEAD, OPTIONS requests
- /api/auth/\* (uses JWT instead)
- /health
- Public endpoints

---

## Role Permissions

### Admin User Roles

| Role                   | Permissions                                              |
| ---------------------- | -------------------------------------------------------- |
| **admin**              | Full system access, user management, all client access   |
| **operations_manager** | Operations access, all client access, no user management |
| **account_manager**    | Assigned clients only, portal user management            |

---

### Portal User Roles

| Role        | Permissions                        |
| ----------- | ---------------------------------- |
| **admin**   | Full access to client's data       |
| **manager** | Read/write access to client's data |
| **viewer**  | Read-only access to client's data  |

---

### Endpoint Permissions

| Endpoint                  | Admin | Ops Manager | Account Manager |
| ------------------------- | ----- | ----------- | --------------- |
| POST /api/auth/register   | ✅    | ❌          | ❌              |
| GET /api/users            | ✅    | ❌          | ❌              |
| POST /api/users           | ✅    | ❌          | ❌              |
| PUT /api/users/:id        | ✅    | ❌          | ❌              |
| GET /api/users/portal     | ✅    | ❌          | ✅              |
| POST /api/users/portal    | ✅    | ❌          | ✅              |
| PUT /api/users/portal/:id | ✅    | ❌          | ✅              |
| All other endpoints       | ✅    | ✅\*        | ✅\*            |

\*With client access restrictions for account_manager

---

## Common Examples

### Complete Login Flow

```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "securepass123"
  }' \
  -c cookies.txt

# 2. Access protected endpoint
curl -X GET http://localhost:3001/api/auth/me \
  -b cookies.txt

# 3. Refresh token
curl -X POST http://localhost:3001/api/auth/refresh \
  -b cookies.txt \
  -c cookies.txt

# 4. Logout
curl -X POST http://localhost:3001/api/auth/logout \
  -b cookies.txt
```

---

### Complete Password Reset Flow

```bash
# 1. Request reset
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "userType": "admin"
  }'

# Response includes token in dev mode
# {"debug": {"token": "abc123..."}}

# 2. Verify token (optional)
curl -X POST http://localhost:3001/api/auth/verify-reset-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123..."
  }'

# 3. Reset password
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123...",
    "password": "newsecurepass123"
  }'
```

---

### User Management Flow

```bash
# Login as admin
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"pass123"}' \
  | jq -r '.accessToken')

# Create user
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "newuser@example.com",
    "password": "securepass123",
    "name": "New User",
    "role": "account_manager"
  }'

# List users
curl -X GET http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN"

# Update user
curl -X PUT http://localhost:3001/api/users/{userId} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "isActive": false
  }'
```

---

### Preferences Management

```bash
# Get preferences
curl -X GET http://localhost:3001/api/preferences \
  -H "Authorization: Bearer $TOKEN"

# Update preferences
curl -X PATCH http://localhost:3001/api/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "chartColorScheme": "dark",
    "compactMode": true
  }'

# Create layout
curl -X POST http://localhost:3001/api/preferences/layouts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "My Layout",
    "isDefault": true,
    "layout": [...]
  }'
```

---

## Error Codes Reference

| Code             | HTTP Status | Description               |
| ---------------- | ----------- | ------------------------- |
| UNAUTHORIZED     | 401         | No token or invalid token |
| FORBIDDEN        | 403         | Insufficient permissions  |
| VALIDATION_ERROR | 400         | Invalid input data        |
| NOT_FOUND        | 404         | Resource not found        |
| CONFLICT         | 409         | Resource already exists   |

---

## Environment Variables

```env
# Required
JWT_SECRET=your-secret-key-min-32-chars
DATABASE_URL=postgresql://...

# Optional
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NODE_ENV=production
CORS_ORIGIN=https://app.example.com
ADMIN_APP_URL=https://admin.example.com
PORTAL_APP_URL=https://portal.example.com
```

---

**Reference Guide Version**: 1.0.0
**Last Updated**: 2025-12-15
**API Base URL**: http://localhost:3001/api (dev) | https://api.example.com (prod)
