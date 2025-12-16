# Inventory Intelligence Platform - Admin User Guide

**Version:** 1.0
**Last Updated:** December 2024
**Audience:** System Administrators, Operations Managers, Account Managers

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Dashboard Features](#2-dashboard-features)
3. [Client Management](#3-client-management)
4. [Financial Management](#4-financial-management)
5. [Shipment Tracking](#5-shipment-tracking)
6. [Order Timing & Deadlines](#6-order-timing--deadlines)
7. [AI/ML Features](#7-aiml-features)
8. [Benchmarking](#8-benchmarking)
9. [Dashboard Personalization](#9-dashboard-personalization)
10. [Reports & Exports](#10-reports--exports)
11. [User Management](#11-user-management)
12. [Data Import & Management](#12-data-import--management)
13. [Settings & Configuration](#13-settings--configuration)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Platform Overview

### What is the Inventory Intelligence Platform?

The Inventory Intelligence Platform is a comprehensive inventory management system designed to help businesses track stock levels, predict demand, optimize ordering, and prevent stockouts. The platform combines real-time inventory tracking with AI-powered analytics to provide actionable insights.

### Key Benefits

- **Proactive Monitoring**: Real-time alerts for low stock, stockouts, and critical items
- **AI-Powered Insights**: Machine learning forecasts demand and identifies risk factors
- **Multi-Client Management**: Manage multiple client accounts from a single dashboard
- **Intelligent Imports**: Smart column mapping with learning capabilities
- **Comprehensive Analytics**: Deep insights into usage patterns, trends, and performance
- **Benchmarking**: Privacy-preserving comparisons across similar clients
- **Custom Fields**: Flexible data model to track client-specific metrics

### User Roles

The platform supports three user roles with different permission levels:

1. **Admin**: Full system access, can manage all clients and users
2. **Operations Manager**: Access to all clients, can generate reports and manage operations
3. **Account Manager**: Access to assigned clients only, can manage client data and imports

---

## 2. Dashboard Features

### Main Dashboard Overview

The main dashboard provides an at-a-glance view of your entire inventory ecosystem.

**Location:** Navigate to the Dashboard from the home icon in the sidebar

[Screenshot: Dashboard Overview]

### Dashboard Components

#### Statistics Cards

Four key metric cards display:

- **Total Products**: Aggregate count across all clients
- **Critical Alerts**: Items requiring immediate attention (stockouts and critical low stock)
- **Low Stock Items**: Products approaching reorder point
- **Healthy Items**: Products with adequate stock levels

Each card is clickable and filters to the relevant view.

#### Alerts Requiring Attention

Displays recent unread alerts organized by severity:

- **Critical** (Red): Stockouts and items below 50% of reorder point
- **Warning** (Amber): Items at 50-100% of reorder point
- **Info** (Blue): General notifications

**To view an alert:**

1. Click on any alert in the list
2. Review product details and stock status
3. Mark as read or dismiss as needed

#### Risk Dashboard

AI-powered risk assessment showing products at elevated risk of stockout.

**Risk Levels:**

- **Critical** (90-100): Immediate action required
- **High** (70-89): Action needed within 3-5 days
- **Moderate** (50-69): Monitor closely
- **Low** (0-49): Normal monitoring

Each risk item shows:

- Product name and client
- Overall risk score (0-100)
- Contributing factors (e.g., "Low Stock: 85%", "High Demand: 72%")

**Best Practice:** Review the Risk Dashboard daily and prioritize critical items first.

#### Clients Overview

Quick summary of all client accounts showing:

- Client name and code
- Total product count
- Stock status breakdown (color-coded progress bar)
- Unread alert count

Click any client card to navigate to detailed client view.

---

## 3. Client Management

### Viewing All Clients

**Location:** Click "Clients" in the sidebar navigation

The Clients page displays all client accounts in a grid layout with:

- Client name and unique code
- Total product count
- Stock health visualization (progress bar)
- Lowest weeks remaining indicator
- Critical item count badge

**Search:** Use the search bar to filter clients by name or code

[Screenshot: Clients Grid View]

### Creating a New Client

**Steps:**

1. Navigate to Clients page
2. Click "Add Client" button (top right)
3. Fill in the form:
   - **Client Name**: Full business name (e.g., "Acme Corporation")
   - **Client Code**: Short unique identifier (e.g., "ACME") - auto-uppercased
4. Click "Create Client"

**API Endpoint:** `POST /api/clients`

**Validation Rules:**

- Name must be at least 2 characters
- Code must be unique across all clients
- Code will be automatically converted to uppercase

### Viewing Client Details

Click any client card to view comprehensive client information.

**Client Detail Tabs:**

1. **Products Tab**
   - View all products organized by type (Evergreen, Event, Completed)
   - Search products by ID or name
   - Stock status indicators with color coding
   - Usage tier badges showing calculation confidence
   - On-order status with pending order details

2. **Comments Tab**
   - Team collaboration space for client-specific notes
   - Tag team members with @mentions
   - Attach to specific products or general client discussions

3. **Activity Tab**
   - Comprehensive audit log of all client actions
   - Filter by action type (import, update, order, etc.)
   - Shows user, timestamp, and change details

4. **Tasks Tab**
   - Create and manage to-do items for the client
   - Assign tasks to team members
   - Track completion status

[Screenshot: Client Detail View with Tabs]

### Stock Health Overview

The Stock Health panel shows product distribution across status levels:

- **Critical** (Red): 0-50% of reorder point
- **Low** (Amber): 50-100% of reorder point
- **Watch** (Yellow): 100-150% of reorder point
- **Healthy** (Green): Above 150% of reorder point

### Custom Data Insights Widget

Displays analytics from imported custom fields:

- Aggregate statistics (sum, average, min, max)
- Distribution charts for categorical data
- Top values and trends
- Field-specific formatting (currency, percentages, etc.)

**Tip:** Custom fields are automatically detected during import and can be configured in Client Settings.

### Editing Client Information

**Steps:**

1. Navigate to Client Detail page
2. Click the Settings icon (gear) in the header
3. Modify client name or code
4. Click "Save Changes"

**API Endpoint:** `PATCH /api/clients/:clientId`

### Deleting a Client

⚠️ **Warning:** This action is irreversible and deletes all associated data.

**Steps:**

1. Open Client Settings modal
2. Click "Delete Client" (red button, bottom left)
3. Review the warning message
4. Confirm deletion

**What gets deleted:**

- All products and inventory data
- Transaction history
- Usage metrics and snapshots
- Import records
- Alerts and notifications
- Custom field data

**API Endpoint:** `DELETE /api/clients/:clientId`

---

## 4. Financial Management

### Economic Order Quantity (EOQ) Analysis

The platform calculates optimal order quantities to minimize total inventory costs.

**Access:** Client Analytics → Financial Tab

**EOQ Formula:**

```
EOQ = √(2 × Annual Demand × Order Cost / Holding Cost)
```

**Key Metrics Displayed:**

- Recommended order quantity
- Optimal order frequency
- Total annual cost
- Holding costs vs. ordering costs

**To use EOQ insights:**

1. Navigate to Client Analytics
2. Review EOQ recommendations per product
3. Compare current ordering patterns
4. Adjust order quantities to match recommendations

### Budget Tracking

Monitor inventory spending and budget allocation.

**Features:**

- Monthly spending trends
- Budget vs. actual comparisons
- Forecast future spending
- Category-wise breakdown

**Best Practice:** Set budget alerts at 80% and 95% thresholds to avoid overspending.

### Cost Optimization

The platform identifies cost-saving opportunities:

- **Overstocked Items**: Products with >6 months supply
- **Dead Stock**: Products with no usage in 90+ days
- **Consolidation Opportunities**: Items that can be combined in orders
- **Volume Discount Potential**: Products approaching tier pricing thresholds

**Location:** Client Analytics → Cost Optimization Tab

[Screenshot: Cost Optimization Dashboard]

---

## 5. Shipment Tracking

### Creating a New Shipment

**Steps:**

1. Navigate to Orders page
2. Find the order request
3. Click "Create Shipment"
4. Fill in shipment details:
   - **Carrier**: Select from dropdown (FedEx, UPS, USPS, DHL, Other)
   - **Tracking Number**: Enter carrier tracking ID
   - **Service Level**: Ground, Express, Priority, etc.
   - **Package Count**: Number of packages
   - **Destination**: City and state
   - **Estimated Delivery**: Expected arrival date
5. Add items to shipment (products and quantities)
6. Click "Create Shipment"

**API Endpoint:** `POST /api/shipments`

[Screenshot: Create Shipment Form]

### Viewing Active Shipments

**Location:** Shipments → Active

Shows all in-transit shipments with:

- Tracking number (clickable link to carrier site)
- Current status
- Destination
- Estimated delivery date
- Days in transit

**Shipment Statuses:**

- `pending`: Shipment created but not yet picked up
- `in_transit`: Package is en route
- `out_for_delivery`: Package is on delivery truck
- `delivered`: Successfully delivered
- `exception`: Delivery issue (requires attention)
- `returned`: Package returned to sender

### Adding Tracking Events

**Steps:**

1. Open shipment detail page
2. Click "Add Event"
3. Fill in event details:
   - Status update
   - Description (e.g., "Arrived at distribution center")
   - Location (optional)
   - Event timestamp
4. Click "Add Event"

**API Endpoint:** `POST /api/shipments/:id/events`

**Tip:** Tracking events are automatically displayed in chronological order.

### Shipment Statistics

**Location:** Navigate to Shipments → Stats

View aggregate metrics:

- Total shipments (by status)
- Average delivery time
- On-time delivery rate
- Exception rate
- Carrier performance comparison

### Bulk Shipment Updates

For processing multiple shipments:

1. Use the bulk import feature (CSV)
2. Map columns: tracking number, status, carrier
3. Review and confirm import
4. System updates all matching shipments

**CSV Format:**

```csv
Tracking Number,Status,Carrier,Location,Description
1Z999AA10123456784,in_transit,UPS,"Memphis, TN",Departed facility
9400100000000000000000,delivered,USPS,"New York, NY",Delivered
```

---

## 6. Order Timing & Deadlines

### Understanding Lead Times

The platform tracks four types of lead time for accurate deadline calculations:

1. **Supplier Lead Time**: Days from order to shipment from supplier
2. **Shipping Lead Time**: Transit time to your facility
3. **Processing Lead Time**: Internal processing and quality checks
4. **Safety Buffer**: Extra days to account for delays

**Total Lead Time** = Supplier + Shipping + Processing + Safety Buffer

### Viewing Order Deadlines

**Location:** Dashboard or Client Detail → Order Deadlines Widget

Displays upcoming deadlines sorted by urgency:

**Urgency Levels:**

- **Immediate** (Red): Order needed today or past due
- **Urgent** (Orange): 1-7 days until deadline
- **Soon** (Yellow): 8-14 days until deadline
- **Planned** (Green): 15+ days until deadline

Each deadline shows:

- Product name and ID
- Days until reorder point
- Recommended order date
- Current stock and usage rate

[Screenshot: Order Deadlines Widget]

### Configuring Lead Times

#### Client-Level Defaults

**Steps:**

1. Navigate to Client Detail page
2. Click Settings → Order Timing Defaults
3. Set default values:
   - Default Supplier Lead Days (e.g., 10)
   - Default Shipping Days (e.g., 3)
   - Default Processing Days (e.g., 1)
   - Default Safety Buffer Days (e.g., 2)
   - Alert Days Before Deadline (e.g., 7)
4. Click "Save Defaults"

**API Endpoint:** `PUT /api/order-timing/:clientId/defaults`

**Use Case:** These defaults apply to all new products for the client.

#### Product-Specific Lead Times

For products with unique lead times:

**Steps:**

1. Navigate to Product Detail page
2. Click "Edit Lead Time"
3. Override any of the default values
4. Click "Save"

**API Endpoint:** `PATCH /api/order-timing/product/:productId/lead-time`

**Example:** A custom-printed product might have:

- Supplier Lead: 21 days (custom printing time)
- Shipping: 5 days (international)
- Processing: 2 days (quality inspection)
- Safety Buffer: 3 days

### Bulk Lead Time Updates

**Use Case:** Update lead times for multiple products via CSV import

**Steps:**

1. Navigate to Order Timing page
2. Click "Bulk Update Lead Times"
3. Upload CSV file with columns:
   - Product ID
   - Supplier Lead Days
   - Shipping Lead Days
   - Processing Lead Days
   - Safety Buffer Days
4. Review mapping
5. Confirm import

**API Endpoint:** `POST /api/order-timing/:clientId/bulk-lead-times`

**CSV Example:**

```csv
Product ID,Supplier Lead Days,Shipping Days,Processing Days,Safety Buffer
SKU-001,14,3,1,2
SKU-002,7,2,1,1
SKU-003,21,5,2,3
```

### Order Timing Reports

**Location:** Reports → Order Timing Summary

Generate reports showing:

- Products approaching reorder point
- Recommended order schedule (next 30/60/90 days)
- Lead time compliance metrics
- Late order analysis

---

## 7. AI/ML Features

The platform includes several AI-powered features to provide predictive insights and automation.

### Risk Scoring

**What it does:** Assigns a risk score (0-100) to each product based on multiple factors.

**Risk Factors:**

- Low stock level (weighted 30%)
- High demand volatility (weighted 20%)
- Long lead time (weighted 15%)
- Seasonal demand patterns (weighted 15%)
- Past stockout history (weighted 10%)
- Supplier reliability (weighted 10%)

**Accessing Risk Scores:**

1. View Risk Dashboard on main page (top 10 risky products)
2. Navigate to Client Analytics → Risk Analysis (all products)
3. API: `GET /api/ai/risk/top-risky?limit=50`

[Screenshot: Risk Dashboard with Risk Factors]

**Using Risk Scores:**

- Prioritize products with scores >70 for immediate review
- Set up automated alerts for risk score thresholds
- Include risk scores in weekly operations meetings

### Anomaly Detection

**What it does:** Identifies unusual patterns in inventory data that may indicate issues.

**Types of Anomalies Detected:**

- Unexpected usage spikes (>3 standard deviations)
- Sudden drop in usage (possible discontinued product)
- Stock level discrepancies (inventory vs. transactions mismatch)
- Seasonal anomalies (unusual demand outside normal season)

**Location:** Anomaly Alerts Widget on Dashboard

**Anomaly Alert Fields:**

- Product and client information
- Anomaly type
- Severity (low, medium, high, critical)
- Detected value vs. expected value
- Confidence score (0-100%)
- Recommended action

**Best Practice:** Review anomaly alerts daily. High-confidence (>80%) critical anomalies require immediate investigation.

**API Endpoint:** `GET /api/ai/anomalies?clientId=:id&severity=high`

### Demand Forecasting

**What it does:** Predicts future demand using Facebook Prophet time-series forecasting.

**Features:**

- 30/60/90-day forecasts
- Seasonality detection (weekly, yearly)
- Confidence intervals (95%)
- Accuracy metrics (MAPE, RMSE)

**Accessing Forecasts:**

**Steps:**

1. Navigate to Product Detail page
2. Click "Analytics" tab
3. View "Demand Forecast" chart
4. Adjust forecast horizon (default 30 days)

**Alternative:** Client Analytics → Demand Forecast page

**Interpreting Forecast Charts:**

- **Blue Line**: Predicted demand (mean forecast)
- **Shaded Blue Area**: 95% confidence interval
- **MAPE**: Mean Absolute Percentage Error (lower is better)
  - <10% = Excellent forecast
  - 10-20% = Good forecast
  - 20-30% = Fair forecast
  - > 30% = Poor forecast (insufficient data or high volatility)

[Screenshot: Demand Forecast Chart]

**Requirements:**

- Minimum 30 days of transaction history
- At least 10 data points
- Best results with 90+ days of history

**Export Forecast:**
Click "Export" button to download CSV with daily predictions and confidence bounds.

**API Endpoint:** `GET /api/ml/forecast/:productId?horizonDays=30`

### Seasonal Pattern Detection

The ML engine automatically detects recurring patterns:

**Pattern Types:**

- **Weekly**: Day-of-week patterns (e.g., higher usage on Mondays)
- **Monthly**: Month-end spikes or mid-month patterns
- **Yearly**: Holiday seasons, summer/winter variations

**Use Case:** Adjust reorder points and safety stock based on detected seasonality.

**Location:** Product Analytics → Seasonality Tab

### Model Accuracy Metrics

The platform tracks and displays model performance:

- **MAPE** (Mean Absolute Percentage Error): Average prediction error
- **RMSE** (Root Mean Squared Error): Penalizes large errors
- **Training Samples**: Number of historical data points used
- **Confidence**: Model's confidence in predictions (0-100%)

**When to Retrain:**

- MAPE increases by >10 percentage points
- New product patterns emerge
- After major business changes (new supplier, different packaging)

**Manual Retrain:** `POST /api/ml/retrain/:productId`

---

## 8. Benchmarking

Benchmarking allows clients to compare their performance against industry peers in a privacy-preserving manner.

### How Benchmarking Works

The platform aggregates anonymized metrics across multiple clients to create cohort benchmarks. Individual client data is never exposed.

**Privacy Guarantees:**

- Minimum 5 clients required per cohort
- All data is aggregated and anonymized
- Only percentile rankings are shared (no absolute values from other clients)
- Clients can opt out at any time

### Opting Into Benchmarking

**Steps (Admin Only):**

1. Navigate to Benchmarking page
2. Select client to enroll
3. Choose cohort:
   - **General**: All participating clients
   - **Industry-Specific**: E-commerce, Retail, Manufacturing, etc.
   - **Size-Based**: By product count or order volume
4. Click "Opt In to Benchmarking"

**API Endpoint:** `POST /api/benchmarking/opt-in`

**Request Body:**

```json
{
  "clientId": "client-uuid",
  "cohort": "general"
}
```

### Viewing Benchmark Reports

**Location:** Client Analytics → Benchmarking Tab

**Metrics Compared:**

1. **Stock Health**
   - Stockout rate vs. cohort average
   - Critical stock percentage
   - Average weeks of supply

2. **Operational Efficiency**
   - Order frequency
   - Average order size
   - Lead time performance

3. **Cost Metrics**
   - Holding cost ratio
   - Order cost efficiency
   - Overstock percentage

4. **Demand Management**
   - Forecast accuracy
   - Demand volatility
   - Seasonal preparedness

**Visualization:**
Each metric shows:

- Your client's value
- Cohort percentile (e.g., "Top 25%")
- Trend direction (improving/declining)
- Recommended target

[Screenshot: Benchmark Comparison Dashboard]

### Understanding Percentile Rankings

- **Top 25%**: Excellent performance, maintain current practices
- **26-50%**: Above average, room for optimization
- **51-75%**: Below average, identify improvement areas
- **Bottom 25%**: Significant opportunity for improvement

### Generating Benchmark Snapshots

Benchmarks are automatically generated weekly. To trigger manual generation:

**Steps (Admin Only):**

1. Navigate to Benchmarking → Admin
2. Click "Generate Snapshot"
3. Select cohort
4. Confirm generation

**API Endpoint:** `POST /api/benchmarking/generate-snapshot`

**Use Case:** Generate after significant client additions or at end of month.

### Opting Out of Benchmarking

**Steps:**

1. Navigate to Benchmarking page
2. Find client enrollment
3. Click "Opt Out"
4. Confirm action

**Effect:** Client data will no longer be included in cohort calculations. Historical benchmark comparisons remain viewable.

**API Endpoint:** `POST /api/benchmarking/opt-out`

---

## 9. Dashboard Personalization

### Customizing Widget Layout

**Feature Status:** Coming in v1.1

Users will be able to:

- Drag and drop widgets to rearrange
- Hide/show widgets based on preference
- Save layouts per user or per role
- Reset to default layout

### Setting Default Views

Configure default landing page per user:

**Steps:**

1. Navigate to Settings → Preferences
2. Select "Default Landing Page"
   - Dashboard (system overview)
   - Clients (client list)
   - Alerts (alert feed)
   - My Tasks (personal task list)
3. Click "Save Preferences"

**API Endpoint:** `PUT /api/preferences/:userId`

### Notification Preferences

Configure how and when you receive notifications:

**Steps:**

1. Navigate to Settings → Notifications
2. Toggle notification channels:
   - **Email Notifications**: Receive alert emails
   - **Push Notifications**: Browser notifications
   - **SMS Alerts** (if configured): Text messages for critical alerts
3. Set severity thresholds:
   - Critical alerts: Always notify
   - Warnings: Daily digest
   - Info: Weekly summary
4. Quiet hours: Set times to mute notifications
5. Click "Save Preferences"

**Email Notification Types:**

- **Immediate**: Critical alerts sent as they occur
- **Daily Digest**: Summary email at chosen time
- **Weekly Summary**: End-of-week rollup

### Favorite Clients

Pin frequently accessed clients for quick navigation:

**Steps:**

1. Navigate to client detail page
2. Click star icon next to client name
3. Access favorites from sidebar "Favorites" section

**Tip:** Favorites appear at the top of client lists and in quick-access dropdown.

---

## 10. Reports & Exports

### Available Report Types

#### 1. Inventory Snapshot Report

Captures current stock status across all products.

**Generating the Report:**

1. Navigate to Reports page
2. Click "Generate Report" → "Inventory Snapshot"
3. Select client
4. Choose format (PDF or Excel)
5. Click "Generate"

**Report Contents:**

- Product ID, name, status
- Current stock (packs and units)
- Reorder point
- Status classification
- Weeks remaining
- Last update timestamp

**API Endpoint:** `GET /api/reports/inventory-snapshot/:clientId`

**Use Case:** End-of-month stock audits, investor reports

[Screenshot: Inventory Snapshot Report]

#### 2. Usage Trends Report

Analyzes consumption patterns over time.

**Configuration Options:**

- Time period: Last 3/6/12 months
- Grouping: Weekly, Monthly, Quarterly
- Product filters: All, Top movers, Specific categories

**Report Contents:**

- Time-series chart of usage
- Period-over-period comparisons
- Trend lines and seasonality indicators
- Top 10 highest usage products
- Products with increasing/decreasing trends

**API Endpoint:** `GET /api/reports/usage-trends/:clientId?period=monthly&months=6`

#### 3. Reorder Schedule Report

Provides recommended ordering timeline.

**Report Contents:**

- Products approaching reorder point
- Recommended order date for each item
- Urgency level (immediate, urgent, soon, planned)
- Estimated order quantity
- Lead time considerations
- 30-day forward-looking schedule

**API Endpoint:** `GET /api/reports/reorder-schedule/:clientId`

**Best Practice:** Generate this report weekly and share with procurement team.

#### 4. Client Review Report (Phase 13 Enterprise)

Comprehensive client performance summary.

**Report Sections:**

- Executive summary
- Stock health scorecard
- Financial metrics (spending, cost efficiency)
- Top products by value
- Alert history and resolution times
- Usage trends and forecasts
- Recommendations

**Generating:**

1. Navigate to Reports → Generate
2. Select "Client Review Report"
3. Choose client and period (7/14/30/60 days)
4. Select recipient email addresses
5. Click "Generate and Send"

**API Endpoint:** `POST /api/reports/generate/client-review/:clientId`

**Request Body:**

```json
{
  "periodDays": 30
}
```

**Format:** Professional PDF report suitable for client presentations.

#### 5. Location Performance Report

Analyzes inventory performance by location (if using multi-location features).

**Report Contents:**

- Per-location stock levels
- Usage rates by location
- Transfer history between locations
- Location-specific alerts
- Cost allocation

**API Endpoint:** `POST /api/reports/generate/location-performance/:clientId/:locationId`

#### 6. Executive Summary Report (Admin Only)

High-level summary across all clients.

**Report Contents:**

- Overall system health score
- Client performance leaderboard
- Top issues requiring attention
- Financial summary (total inventory value)
- User activity metrics
- System usage statistics

**API Endpoint:** `POST /api/reports/generate/executive-summary`

**Schedule:** Automatically generated monthly and sent to admin users.

### Exporting Data

#### CSV Export

Export product lists, transactions, or alerts to CSV:

**From Client Detail Page:**

1. Navigate to client products list
2. Click "Export" button
3. Confirm format (CSV)
4. File downloads automatically

**Export Includes:**

- Product ID, name, status
- Stock levels (packs and units)
- Reorder points
- Weeks remaining
- Usage metrics

**From any data table:**

- Look for Export icon (download arrow)
- Exports current filtered view

#### Excel Export (XLSX)

For more complex exports with multiple sheets:

**Steps:**

1. Navigate to Reports → Custom Export
2. Select data to include:
   - Products
   - Transactions
   - Usage metrics
   - Alerts
3. Choose date range
4. Click "Generate Excel Report"

**Excel Workbook Sheets:**

- Summary (overview and charts)
- Products (full product list)
- Transactions (order history)
- Alerts (alert log)
- Charts (embedded visualizations)

**API Endpoint:** `GET /api/exports/excel/:clientId`

#### PDF Reports

Professional formatted reports for client delivery:

**Steps:**

1. Generate any standard report
2. Select "PDF" format
3. Customize:
   - Include logo
   - Add custom header/footer
   - Choose color scheme
4. Generate and download

**PDF Options:**

- Portrait or landscape orientation
- Include charts and graphs
- Add commentary sections
- Digital signature support

**API Endpoint:** `GET /api/exports/pdf/report/:reportId`

### Scheduling Automated Reports

Set up recurring report generation and delivery:

**Steps:**

1. Navigate to Reports → Scheduled Reports
2. Click "New Schedule"
3. Configure:
   - Report type
   - Client(s)
   - Frequency (Daily, Weekly, Monthly)
   - Day and time
   - Recipients (email addresses)
   - Format (PDF, Excel, CSV)
4. Click "Create Schedule"

**Schedule Options:**

- **Daily**: Every weekday at chosen time
- **Weekly**: Specific day (e.g., every Monday at 8am)
- **Monthly**: Day of month (e.g., 1st or last business day)

**Email Delivery:**
Reports are automatically sent as attachments. Email includes:

- Report summary
- Key highlights
- Direct link to view in platform
- Attachment (PDF/Excel)

**Managing Schedules:**

- View all scheduled reports
- Pause/resume schedules
- Edit recipients or timing
- View delivery history

---

## 11. User Management

### User Roles and Permissions

The platform has three user roles with distinct permissions:

| Permission          | Admin | Operations Manager | Account Manager           |
| ------------------- | ----- | ------------------ | ------------------------- |
| View all clients    | ✅    | ✅                 | ❌ (assigned only)        |
| Create/edit clients | ✅    | ✅                 | ✅                        |
| Delete clients      | ✅    | ❌                 | ❌                        |
| Import data         | ✅    | ✅                 | ✅                        |
| Generate reports    | ✅    | ✅                 | ✅ (for assigned clients) |
| Manage users        | ✅    | ❌                 | ❌                        |
| System settings     | ✅    | ❌                 | ❌                        |
| View benchmarking   | ✅    | ✅                 | ❌                        |
| Access ML features  | ✅    | ✅                 | ✅                        |

### Creating Admin Users

**Steps:**

1. Navigate to Settings → Team Members
2. Click "Add User"
3. Fill in user details:
   - **Full Name**: User's complete name
   - **Email**: Work email address (used for login)
   - **Password**: Minimum 8 characters
   - **Role**: Select from dropdown
4. Click "Create User"

**API Endpoint:** `POST /api/users`

**Request Body:**

```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "password": "SecurePass123!",
  "role": "account_manager"
}
```

**Email Notification:**
New users receive a welcome email with:

- Login credentials
- Platform URL
- Quick start guide link
- Support contact

[Screenshot: Create User Modal]

### Managing Account Managers

Account Managers have limited access to assigned clients only.

**Assigning Clients to Account Manager:**

1. Navigate to Users → Account Managers
2. Click on user name
3. Click "Manage Client Access"
4. Select clients to grant access
5. Click "Update Access"

**API Endpoint:** `POST /api/users/:userId/clients`

**Best Practice:** Assign 3-5 clients per Account Manager for optimal workload distribution.

### Viewing Portal Users (Client Users)

Portal users are client-side users who access the self-service portal.

**Location:** Settings → Portal Users

**Portal User Information:**

- Name and email
- Associated client
- Role (usually "client_user")
- Account status (active/inactive)
- Last login date

**Note:** Portal users are managed separately and have limited access compared to admin users. They can only view their own client's data.

### Deactivating Users

To temporarily disable a user account without deleting:

**Steps:**

1. Navigate to Settings → Team Members
2. Find the user
3. Click "Deactivate"
4. Confirm action

**Effect:**

- User cannot log in
- Active sessions are terminated
- User data and activity history preserved
- Can be reactivated at any time

**API Endpoint:** `PUT /api/users/:userId`

**Request Body:**

```json
{
  "isActive": false
}
```

**Use Case:** Employee on leave, temporary contractors, security concerns

### Reactivating Users

**Steps:**

1. Navigate to Settings → Team Members
2. Filter: Show "Inactive Users"
3. Find the user
4. Click "Activate"

**Effect:** User can immediately log in with existing credentials.

### Password Reset

#### Admin-Initiated Reset

**Steps:**

1. Navigate to Settings → Team Members
2. Click user's name
3. Click "Reset Password"
4. Password reset email sent to user
5. User clicks link and sets new password

**API Endpoint:** `POST /api/password-reset/request`

#### User Self-Service Reset

Users can reset their own password:

1. On login page, click "Forgot Password?"
2. Enter email address
3. Receive reset email
4. Click link in email
5. Set new password
6. Log in with new credentials

**Security:**

- Reset links expire after 1 hour
- One-time use only
- Requires email verification

### Viewing User Activity

**Location:** Settings → Audit Log

Filter audit log by user to see:

- Login history
- Actions performed (imports, edits, deletions)
- Timestamp and IP address
- Affected entities (clients, products)

**API Endpoint:** `GET /api/audit?userId=:userId&limit=100`

---

## 12. Data Import & Management

### Understanding Import Types

The platform supports three import types:

1. **Inventory Import**: Stock levels and product data
2. **Orders Import**: Transaction history and usage data
3. **Both**: Combined inventory snapshot + order history

The import system **automatically detects** the import type based on column headers.

### Preparing Import Files

**Supported Formats:**

- CSV (Comma-Separated Values)
- XLSX (Excel 2007+)
- XLS (Excel 97-2003)
- TSV (Tab-Separated Values)

**File Size Limit:** 50MB per file

**Best Practices:**

- Use first row for headers (no merged cells)
- Remove empty rows and columns
- Avoid special characters in headers
- Use consistent date formats (YYYY-MM-DD)
- Number formats without currency symbols or commas
- UTF-8 encoding for international characters

#### Inventory Import Template

Required columns (at least one identifier):

- Product ID / SKU / Item ID
- Product Name (recommended)
- Current Stock (in packs)
- Pack Size (units per pack)
- Reorder Point (optional)

Optional columns:

- Category
- Supplier
- Cost
- Location
- Custom fields (any additional columns)

**Example:**

```csv
Product ID,Product Name,Current Stock,Pack Size,Reorder Point,Category
SKU-001,Blue Widget,50,12,30,Widgets
SKU-002,Red Gadget,25,24,20,Gadgets
```

#### Orders Import Template

Required columns:

- Product ID / SKU
- Order Date / Date Submitted
- Quantity (units or packs)

Optional columns:

- Order Number
- Order Status (pending, submitted, completed, cancelled)
- Location
- Notes

**Example:**

```csv
Product ID,Date Submitted,Quantity,Order Status
SKU-001,2024-01-15,120,completed
SKU-001,2024-02-20,96,completed
SKU-002,2024-01-22,48,completed
```

### Importing Data

#### Single File Import

**Steps:**

1. Navigate to Client Detail page
2. Click "Import" button
3. Click "Choose File" or drag and drop
4. Wait for file upload and analysis
5. Review the import preview:
   - Detected import type
   - Row count
   - Column mappings (auto-generated)
   - Sample data (first 5 rows)
   - Validation warnings
6. Adjust column mappings if needed (drag to remap)
7. Click "Analyze Import" to see impact preview
8. Review projected changes:
   - Status changes (how many products move to critical/low/healthy)
   - New products to be created
   - Stock adjustments
   - Anomalies detected
9. Click "Confirm Import"

**API Endpoints:**

- Upload: `POST /api/imports/upload`
- Analyze: `POST /api/imports/:importId/analyze`
- Confirm: `POST /api/imports/:importId/confirm`

[Screenshot: Import Preview with Column Mapping]

#### Multiple File Import

**Use Case:** Import several files at once (e.g., inventory + orders + locations)

**Steps:**

1. Click "Import" → "Multiple Files"
2. Select or drag multiple files (max 10)
3. Review preview for each file
4. Adjust mappings per file if needed
5. Click "Import All"

**Processing:** Files are processed sequentially. Monitor progress in Import History.

**API Endpoint:** `POST /api/imports/upload-multiple`

### Intelligent Column Mapping

The platform uses machine learning to suggest column mappings:

**How it Works:**

1. Analyzes column headers (text similarity)
2. Examines sample data (data type detection)
3. Checks historical mappings for this client (learning)
4. Considers common variations (e.g., "SKU" = "Product ID" = "Item Code")
5. Assigns confidence score (High, Medium, Low)

**Mapping Confidence:**

- **High** (Green): >90% confidence, usually correct
- **Medium** (Yellow): 70-90% confidence, verify
- **Low** (Red): <70% confidence, likely needs adjustment

**Custom Fields:**
Any column that doesn't match standard fields is treated as a custom field and stored in the flexible `customData` JSON field on products.

### Adjusting Column Mappings

**To change a mapping:**

1. Click the column mapping row
2. Select new target field from dropdown
3. Or type to create new custom field
4. System shows preview of data in that column

**Tip:** The system learns from your corrections. If you always map "Item #" to "Product ID," it will suggest this automatically in future imports.

**API Note:** Corrections are stored via `POST /api/imports/mapping-corrections`

### Import Analysis & Impact Preview

Before committing an import, the analysis preview shows:

**Status Changes:**

- 5 products will move to Critical
- 12 products will move to Low
- 3 products will move to Healthy

**New Products:**

- 8 products will be created (not currently in system)
- List of product IDs

**Stock Adjustments:**

- Average change: +15%
- Largest increase: SKU-045 (+200 packs)
- Largest decrease: SKU-023 (-50 packs)

**Anomalies Detected:**

- SKU-012: Usage spike (300% above normal)
- SKU-034: Unexpected stock drop (possible data error)

**Data Quality Issues:**

- 3 rows with missing Product ID (will be skipped)
- 5 rows with invalid date format (will use today's date)

**Tip:** Address critical issues before confirming import. Minor warnings can usually be ignored.

[Screenshot: Import Impact Analysis]

### Viewing Import History

**Location:** Navigate to Imports page

Shows all past imports with:

- Filename and import type
- Date/time and importing user
- Status (pending, processing, completed, failed, rolled_back)
- Row count and duration
- Errors/warnings count

**Clicking an import** shows detailed results:

- Products created/updated
- Transactions imported
- Errors encountered
- Processing log

**API Endpoint:** `GET /api/imports/history`

### Rolling Back an Import

If an import introduced errors, you can undo it:

**Steps:**

1. Navigate to Imports → History
2. Find the import
3. Click "Rollback"
4. Confirm action
5. System will:
   - Delete all transactions created by this import
   - Delete orphan products (products only from this import)
   - Restore previous stock levels
   - Recalculate all metrics

⚠️ **Warning:** Only rollback recent imports. Rolling back old imports may cause data inconsistencies.

**API Endpoint:** `DELETE /api/imports/:importId/data`

### Troubleshooting Failed Imports

**Common Issues:**

#### 1. "File too large" Error

**Solution:**

- Split file into smaller chunks (<50MB each)
- Remove unnecessary columns
- Compress with ZIP (platform auto-extracts)

#### 2. "No Product ID column detected"

**Solution:**

- Ensure at least one column contains product identifiers
- Headers must be in first row
- Check for typos in header names

#### 3. "Python not found" Error

**Solution:**

- Contact system administrator
- Requires Python 3.7+ installed on server
- Verify Python dependencies installed

#### 4. "Import timed out"

**Solution:**

- Import took >30 minutes (very large file)
- Split into smaller batches
- Import during off-peak hours

#### 5. Encoding Errors (garbled text)

**Solution:**

- Save CSV with UTF-8 encoding
- In Excel: Save As → CSV UTF-8
- Avoid special characters if possible

### Custom Field Management

**Viewing Custom Fields:**

1. Navigate to Client Detail → Custom Fields tab
2. See all detected custom fields with:
   - Field name
   - Data type (text, number, date, boolean)
   - Usage count (products with this field)
   - Display settings

**Configuring Custom Field Display:**

1. Click custom field
2. Edit settings:
   - **Display Name**: Friendly name shown in UI
   - **Is Displayed**: Show in product lists
   - **Is Pinned**: Show in product card
   - **Display Order**: Sort priority
   - **Aggregation Type**: Sum, Avg, Min, Max, Count
   - **Format Pattern**: Number format, date format, etc.
3. Click "Save"

**API Endpoint:** `PATCH /api/clients/:clientId/custom-fields/:fieldId`

**Custom Field Aggregates:**

For numeric custom fields, view aggregates:

- Sum: Total across all products
- Average: Mean value
- Min/Max: Range
- Count: Products with non-null values
- Distribution: Histogram of values

**Location:** Client Analytics → Custom Fields → Select field

**API Endpoint:** `GET /api/clients/:clientId/custom-field-aggregates/:fieldName`

**Example Use Cases:**

- "Supplier Cost" → Sum to get total supplier spend
- "Product Weight" → Average weight across SKUs
- "Last Review Date" → Find oldest unreviewedproducts
- "Customer Rating" → Average rating by category

---

## 13. Settings & Configuration

### Profile Settings

**Location:** Click profile icon → Settings

**Editable Fields:**

- Full Name
- Email (view only - contact admin to change)
- Role (view only)

**Password Change:**

1. Click "Change Password"
2. Enter current password
3. Enter new password (min 8 characters)
4. Confirm new password
5. Click "Update Password"

### Notification Settings

Configure how you receive alerts:

**Email Notifications:**

- Toggle on/off
- Frequency: Immediate, Daily Digest, Weekly Summary
- Severity filter: Critical only, Warning+, All

**Push Notifications:**

- Toggle browser notifications
- Requires browser permission
- Severity filter

**Alert Preferences:**

- Stockout alerts: Always on (recommended)
- Low stock alerts: Configurable
- Anomaly alerts: Medium+ severity
- Risk score alerts: High+ severity

**Quiet Hours:**
Set time range for muted notifications (e.g., 10 PM - 7 AM)

### Client-Level Settings

**Location:** Client Detail → Settings Icon

**Available Settings:**

#### Inventory Settings

- **Reorder Lead Days**: Default time to reorder (e.g., 14 days)
- **Safety Stock Weeks**: Buffer weeks of stock (e.g., 2 weeks)
- **Service Level Target**: Desired availability (e.g., 95% = 0.95)
- **Show Orphan Products**: Display products with no recent transactions

#### Calculation Settings

- **Usage Calculation Method**: Average, Median, Weighted
- **Usage Window**: Days to include in calculations (default 90)
- **Monthly Usage Method**: Calendar month vs. rolling 30 days

#### Alert Settings

- **Alert Threshold - Critical**: Stock level that triggers critical alert (e.g., 50%)
- **Alert Threshold - Low**: Low stock threshold (e.g., 100%)
- **Auto-dismiss Alerts**: Automatically dismiss alerts when stock replenished
- **Alert Email Recipients**: Comma-separated email list

#### Display Settings

- **Default Product View**: Evergreen, Event, All
- **Products Per Page**: 25, 50, 100
- **Default Sort**: Name, Stock Level, Status

**Saving Changes:**
Click "Save Settings" button to apply.

**API Endpoint:** `PATCH /api/clients/:clientId`

**Request Body Example:**

```json
{
  "settings": {
    "reorderLeadDays": 14,
    "safetyStockWeeks": 2,
    "serviceLevelTarget": 0.95
  }
}
```

### Global System Settings (Admin Only)

**Location:** Settings → System Configuration

**Configuration Options:**

#### Authentication

- Session timeout duration
- Password complexity requirements
- Multi-factor authentication (enable/disable)
- SSO configuration (SAML, OAuth)

#### Import Settings

- Max file size limit
- Auto-recalculate after import
- Import timeout duration
- Parallel import workers

#### Email Settings

- SMTP server configuration
- From address
- Email templates
- Delivery verification

#### Integration Settings

- API rate limits
- Webhook endpoints
- Third-party integrations (Shopify, QuickBooks, etc.)

#### ML/AI Settings

- Forecast model retraining frequency
- Anomaly detection sensitivity
- Risk scoring weights
- Minimum data requirements

**Caution:** Changes to global settings affect all users and clients.

---

## 14. Troubleshooting

### Common Issues and Solutions

#### Cannot Log In

**Symptoms:** Login page shows "Invalid credentials" or doesn't respond

**Solutions:**

1. Verify username/email is correct
2. Check Caps Lock is off for password
3. Try "Forgot Password" flow
4. Clear browser cache and cookies
5. Try different browser
6. Contact admin to verify account is active

**If admin:** Check user status in Settings → Team Members

---

#### Import Stuck at "Processing"

**Symptoms:** Import shows "processing" status for >30 minutes

**Possible Causes:**

- Very large file (>100k rows)
- Python process crashed
- Server resource constraints

**Solutions:**

1. Wait 30 minutes (timeout will trigger)
2. Check import history for error messages
3. Try importing smaller batches
4. Contact system admin to check server logs

**Admin Check:**

```bash
# Check if Python process is running
ps aux | grep "python.*importer"

# Check import logs
tail -f /var/log/inventory-platform/imports.log
```

---

#### Data Not Appearing After Import

**Symptoms:** Import shows "completed" but products don't show new data

**Solutions:**

1. **Hard Refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Check Filters**: Ensure product type filters aren't hiding items
3. **Verify Client**: Confirm you're viewing correct client
4. **Recalculate**: Click "Recalculate" button on client page
5. **Check Import Details**: View import log for errors

**API Manual Recalculate:**

```
POST /api/imports/recalculate/:clientId
```

---

#### Charts Not Loading

**Symptoms:** Widgets show "Loading..." indefinitely or error message

**Causes:**

- No data available for time range
- ML service unavailable
- Network connectivity issues

**Solutions:**

1. Refresh page
2. Check browser console for errors (F12 → Console tab)
3. Verify you have transaction history (required for forecasts)
4. Try adjusting date range
5. Contact support if persists

**Check Data Requirements:**

- Demand Forecast: Requires 30+ days of transaction data
- Risk Dashboard: Requires current stock data
- Benchmarking: Requires opt-in and cohort participation

---

#### Missing Permissions

**Symptoms:** "Access Denied" or "403 Forbidden" messages

**Cause:** User role doesn't have permission for the action

**Solutions:**

1. **Check Role**: Settings → Profile → View your role
2. **Contact Admin**: Request role change if needed
3. **Verify Client Access**: Account Managers only see assigned clients

**Permission Reference:**

- Delete clients: Admin only
- Manage users: Admin only
- Benchmarking: Admin + Ops Manager
- View all clients: Admin + Ops Manager

---

#### Email Notifications Not Received

**Symptoms:** Expected alert emails don't arrive

**Solutions:**

1. **Check Spam/Junk Folder**
2. **Verify Email in Profile**: Settings → Profile
3. **Check Notification Settings**: Settings → Notifications → Verify enabled
4. **Verify Email Server**: Admin → System Settings → Email Configuration
5. **Test Email**: Send test notification

**Admin Troubleshooting:**

```bash
# Check email queue
GET /api/admin/email-queue

# Send test email
POST /api/admin/test-email
{
  "recipient": "user@example.com"
}
```

---

#### Slow Performance

**Symptoms:** Pages load slowly, actions take long time

**Causes:**

- Large datasets
- Complex calculations
- Network latency
- Server resource constraints

**Solutions:**

1. **Clear Browser Cache**: Settings → Privacy → Clear Cache
2. **Use Filters**: Reduce data displayed (date ranges, product filters)
3. **Optimize Queries**: Contact support for database tuning
4. **Check Network**: Run speed test, verify stable connection
5. **Upgrade Plan**: Consider higher-tier plan with dedicated resources

**Performance Tips:**

- Limit reports to necessary date ranges
- Use pagination for large product lists
- Schedule resource-intensive reports for off-peak hours
- Archive old/inactive clients

---

#### Forecast Shows "Insufficient Data"

**Symptoms:** Demand forecast widget displays error message

**Cause:** Not enough historical data for ML model

**Requirements:**

- Minimum 30 days of transaction history
- At least 10 transaction data points
- Regular transaction pattern (not sporadic)

**Solutions:**

1. **Import Historical Data**: Load past orders to build history
2. **Wait for Data Accumulation**: Use system for 30+ days
3. **Check Product Type**: Forecasts don't work well for one-time events
4. **Manual Override**: Set reorder points manually until data accumulates

---

### Getting Help

#### In-Platform Help

**Help Icon**: Click ? icon in navigation bar

- Quick tips for current page
- Link to documentation
- Context-sensitive help articles

#### Support Channels

**Email Support:** support@inventoryplatform.com

- Response time: 24 hours (weekdays)
- Include: Client name, user email, issue description, screenshots

**Live Chat:** Click chat bubble (bottom right)

- Available: Monday-Friday, 9 AM - 5 PM EST
- Instant responses for urgent issues

**Phone Support:** 1-800-INVENTORY

- Available for Enterprise tier customers
- 24/7 for critical issues

**Knowledge Base:** help.inventoryplatform.com

- Searchable articles
- Video tutorials
- Release notes

#### Reporting Bugs

**To report a bug:**

1. Note steps to reproduce
2. Take screenshot or screen recording
3. Check browser console for errors (F12 → Console)
4. Email support with:
   - Bug description
   - Steps to reproduce
   - Expected vs. actual behavior
   - Screenshots/error messages
   - Browser and OS version

**Bug Priority:**

- **Critical**: System down, data loss, security issue → 2-hour response
- **High**: Major feature broken, many users affected → 4-hour response
- **Medium**: Feature partially broken, workaround exists → 24-hour response
- **Low**: Minor issue, cosmetic problem → 3-day response

---

### Appendix: Keyboard Shortcuts

Speed up your workflow with keyboard shortcuts:

| Action          | Windows/Linux | Mac      |
| --------------- | ------------- | -------- |
| Search          | Ctrl + K      | Cmd + K  |
| Go to Dashboard | G then D      | G then D |
| Go to Clients   | G then C      | G then C |
| Go to Alerts    | G then A      | G then A |
| Create Client   | C then N      | C then N |
| Import Data     | I then U      | I then U |
| Help            | ?             | ?        |
| Settings        | ,             | ,        |

**Command Palette:** Ctrl+K (Cmd+K) opens quick navigation

- Type to search clients, products, or actions
- Arrow keys to navigate
- Enter to select

---

### Appendix: API Quick Reference

For developers integrating with the platform:

**Base URL:** `https://api.inventoryplatform.com/v1`

**Authentication:**

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Key Endpoints:**

**Clients:**

- `GET /api/clients` - List all clients
- `POST /api/clients` - Create client
- `GET /api/clients/:id` - Get client details
- `PATCH /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

**Products:**

- `GET /api/clients/:clientId/products` - List products
- `GET /api/products/:id` - Get product details

**Imports:**

- `POST /api/imports/upload` - Upload import file
- `POST /api/imports/:id/confirm` - Confirm and process import
- `GET /api/imports/history` - List import history

**Reports:**

- `GET /api/reports/inventory-snapshot/:clientId` - Inventory snapshot
- `GET /api/reports/usage-trends/:clientId` - Usage trends
- `POST /api/reports/generate/client-review/:clientId` - Generate client review

**AI/ML:**

- `GET /api/ai/risk/top-risky` - Top risky products
- `GET /api/ai/anomalies` - Detected anomalies
- `GET /api/ml/forecast/:productId` - Demand forecast

**Shipments:**

- `POST /api/shipments` - Create shipment
- `GET /api/shipments/active/:clientId` - Active shipments
- `POST /api/shipments/:id/status` - Update shipment status

**Order Timing:**

- `GET /api/order-timing/:clientId/deadlines` - Upcoming deadlines
- `PATCH /api/order-timing/product/:productId/lead-time` - Update lead time

**Benchmarking:**

- `POST /api/benchmarking/opt-in` - Opt into benchmarking
- `GET /api/benchmarking/client/:clientId` - Get benchmark comparison

**Full API documentation:** https://api.inventoryplatform.com/docs

---

### Appendix: Glossary

**Critical Status:** Product stock is at or below 50% of reorder point

**Custom Field:** Client-specific data field stored in flexible JSON structure

**Demand Forecast:** ML-powered prediction of future product usage

**EOQ (Economic Order Quantity):** Optimal order size that minimizes total costs

**Import Batch:** Single import operation tracking file upload and processing

**Lead Time:** Total time from placing order to receiving stock

**Low Status:** Product stock is between 50-100% of reorder point

**MAPE (Mean Absolute Percentage Error):** Forecast accuracy metric (lower is better)

**Orphan Product:** Product created from order import with no inventory data

**Reorder Point:** Stock level that triggers reorder recommendation

**Risk Score:** 0-100 score indicating stockout probability

**Safety Stock:** Extra inventory buffer to prevent stockouts

**Stockout:** Zero stock available for a product

**Usage Tier:** Calculation method used for monthly usage (actual, fallback, estimated)

**Weeks Remaining:** Estimated weeks until stockout based on current usage

---

## Document Revision History

| Version | Date          | Changes         | Author        |
| ------- | ------------- | --------------- | ------------- |
| 1.0     | December 2024 | Initial release | Platform Team |

---

**Need help?** Contact support@inventoryplatform.com or visit help.inventoryplatform.com

**Copyright © 2024 Inventory Intelligence Platform. All rights reserved.**
