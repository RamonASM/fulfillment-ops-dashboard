// =============================================================================
// SEED HELP ARTICLES
// Populates the database with comprehensive help documentation
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// =============================================================================
// ADMIN HELP ARTICLES
// =============================================================================

const adminArticles = [
  {
    slug: "welcome-admin",
    title: "Welcome to Inventory IQ",
    category: "getting-started",
    audience: "admin",
    order: 1,
    isPublished: true,
    excerpt:
      "Get started with Inventory IQ - your comprehensive inventory intelligence platform.",
    content: `# Welcome to Inventory IQ

Inventory IQ is a powerful inventory intelligence platform designed to help you manage, track, and optimize inventory across all your clients.

## What You Can Do

- **Manage Clients**: Add and oversee multiple client accounts
- **Track Inventory**: Monitor stock levels, orders, and shipments in real-time
- **AI-Powered Insights**: Get intelligent recommendations and anomaly detection
- **Generate Reports**: Create comprehensive analytics and reports
- **Set Up Alerts**: Configure automatic notifications for stock issues

## Getting Started

Follow these steps to get up and running:

- [ ] Add your first client
- [ ] Import initial inventory data
- [ ] Configure alert thresholds
- [ ] Explore the dashboard widgets
- [ ] Generate your first report

## Need Help?

Browse the articles on the left or use the search bar to find specific topics. If you can't find what you're looking for, contact our support team.`,
  },
  {
    slug: "managing-clients",
    title: "Managing Clients",
    category: "how-to",
    audience: "admin",
    order: 2,
    isPublished: true,
    excerpt:
      "Learn how to add, view, and manage client accounts in the platform.",
    content: `# Managing Clients

Client management is at the heart of Inventory IQ. Here's everything you need to know about working with client accounts.

## Adding a New Client

1. Click the **"Add Client"** button on the Clients page
2. Fill in the client details:
   - Company name
   - Contact information
   - Billing address
3. Configure initial settings
4. Click **"Create Client"**

> **Tip**: You can import bulk client data using CSV files from the Imports page.

## Viewing Client Details

Click on any client card to view:

- **Overview**: Quick stats and recent activity
- **Inventory**: Current stock levels and products
- **Analytics**: Performance metrics and trends
- **Locations**: Warehouse and distribution centers
- **Orders**: Order history and pending requests

## Client Permissions

Each client has their own portal access where they can:

- View their inventory
- Submit order requests
- Access reports and analytics
- Provide product feedback

## Best Practices

- Keep client contact information up to date
- Review client analytics monthly
- Set up custom alert thresholds for each client
- Document any special handling requirements`,
  },
  {
    slug: "dashboard-overview",
    title: "Understanding the Dashboard",
    category: "features",
    audience: "admin",
    order: 3,
    isPublished: true,
    excerpt:
      "Navigate and customize your dashboard to get the insights you need.",
    content: `# Understanding the Dashboard

Your dashboard is the central hub for monitoring inventory health across all clients.

## Dashboard Widgets

### Stock Health Donut
Shows the distribution of products across health categories:
- **Healthy**: Well-stocked products (green)
- **Watch**: Products to monitor (blue)
- **Low**: Running low on stock (yellow)
- **Critical**: Very low stock (orange)
- **Stockout**: Out of stock (red)

### Monthly Trends Chart
Visualizes inventory trends over time to help identify patterns and seasonality.

### Anomaly Alerts
AI-powered detection of unusual inventory changes or patterns that need attention.

### Location Analytics
Geographic view of inventory distribution across warehouses and locations.

### Top Products
Quick view of your most important products by value, movement, or risk level.

## Customizing Your View

- **Rearrange widgets**: Drag and drop to reorganize
- **Hide/show widgets**: Click the eye icon to toggle visibility
- **Change date ranges**: Use the time selector for historical data
- **Filter by client**: Focus on specific client accounts

## Keyboard Shortcuts

- **G + H**: Go to Dashboard (Home)
- **G + C**: Go to Clients
- **G + A**: Go to Alerts
- **G + ?**: Open this Help guide
- **/**: Quick search

## Getting the Most Value

1. Check your dashboard daily for anomaly alerts
2. Monitor the Stock Health donut for overall health
3. Review Monthly Trends weekly for planning
4. Act on Critical and Stockout items immediately`,
  },
  {
    slug: "importing-data",
    title: "Importing Inventory Data",
    category: "how-to",
    audience: "admin",
    order: 4,
    isPublished: true,
    excerpt: "Step-by-step guide to importing inventory data via CSV files.",
    content: `# Importing Inventory Data

The import feature allows you to quickly add or update large amounts of inventory data.

## Supported File Formats

- CSV (.csv)
- Excel (.xlsx)

## Preparing Your File

Your import file should include these columns:

| Column | Required | Description |
|--------|----------|-------------|
| SKU | Yes | Unique product identifier |
| Name | Yes | Product name |
| Quantity | Yes | Current stock level |
| Location | No | Warehouse/location code |
| Unit Cost | No | Cost per unit |
| Reorder Point | No | Minimum stock threshold |

> **Note**: The first row should contain column headers.

## Import Process

1. Navigate to **Imports** in the sidebar
2. Click **"New Import"**
3. Select your client
4. Choose your file
5. Review the column mapping
6. Click **"Import"**

## Column Mapping

The system will auto-detect columns, but you can adjust:

- Drag and drop to match columns
- Mark columns to skip
- Preview data before importing

## After Import

- Review the import summary
- Check for any errors or warnings
- Verify data in the client's inventory view
- Set up alerts if needed

## Common Issues

**Problem**: Duplicate SKUs
**Solution**: The system will update existing products with matching SKUs

**Problem**: Invalid quantities
**Solution**: Non-numeric values will be flagged - fix in the CSV and re-import

**Problem**: Missing required fields
**Solution**: Ensure SKU, Name, and Quantity columns are present`,
  },
  {
    slug: "csv-export-guide",
    title: "CSV Export & Import Guide for Account Managers",
    category: "how-to",
    audience: "admin",
    order: 5,
    isPublished: true,
    excerpt: "Complete guide to preparing and importing inventory and transaction data for accurate analytics and forecasting.",
    content: `# CSV Export & Import Guide for Account Managers

This guide explains exactly what data you need to export from your client's systems to enable accurate inventory tracking, usage calculations, and intelligent forecasting.

## Why Both Files Matter

The system needs **two types of data** to work properly:

| Data Type | Purpose | What It Enables |
|-----------|---------|-----------------|
| **Inventory** | Current stock snapshot | Stock levels, alerts, reorder points |
| **Transactions** | Historical orders/shipments | Usage calculations, forecasting, trends |

> **Important**: Without transaction history, the system cannot calculate monthly usage or predict future needs. Both files must share the same SKU format.

---

## 1. Inventory CSV (Products)

Export your **complete product catalog** - every SKU that exists, even items with zero stock.

### Required Columns

| Column Name | Example | Description |
|-------------|---------|-------------|
| **Product ID / SKU** | \`EVR-BAN-026\` | Unique product identifier. **Must match exactly** in transactions file |
| **Product Name** | \`Large Banner - Blue\` | Human-readable product name |
| **Available Quantity** | \`150\` | Current stock on hand (packs or units) |

### Recommended Columns

| Column Name | Example | Description |
|-------------|---------|-------------|
| Pack Size | \`24\` | Units per pack (default: 1) |
| Reorder Point | \`25\` | Alert when stock drops below this |
| Item Type | \`evergreen\` | Product category: \`evergreen\`, \`seasonal\`, or \`special\` |
| Unit Cost | \`12.50\` | Cost per unit for value calculations |
| Vendor/Supplier | \`PrintCo Inc\` | Primary supplier name |
| Lead Time (Days) | \`14\` | Days from order to delivery |

### Sample Inventory CSV

\`\`\`csv
SKU,Product Name,Quantity,Pack Size,Reorder Point,Item Type
EVR-BAN-026,Large Banner - Blue,150,1,25,evergreen
EVR-BAN-027,Large Banner - Red,85,1,25,evergreen
EVR-PRT-001,Brochure - Spring 2024,500,50,100,seasonal
EVR-PRO-010,Branded Pen Set,200,12,50,evergreen
\`\`\`

---

## 2. Transactions CSV (Orders/Shipments)

Export **all historical orders** - the more history, the better the forecasting.

### Required Columns

| Column Name | Example | Description |
|-------------|---------|-------------|
| **Order ID** | \`ORD-2024-12345\` | Unique order/shipment number |
| **Product ID / SKU** | \`EVR-BAN-026\` | **Must match exactly** with inventory SKU |
| **Quantity** | \`50\` | Number of units ordered/shipped |
| **Order Date** | \`2024-06-15\` | Date the order was placed or shipped |

### Recommended Columns

| Column Name | Example | Description |
|-------------|---------|-------------|
| Ship To Company | \`ACME Corporation\` | Customer/location name |
| Ship To City | \`New York\` | Destination city |
| Ship To State | \`NY\` | Destination state/province |
| Order Status | \`Shipped\` | Status: Pending, Approved, Shipped, Delivered |
| Unit Price | \`15.00\` | Price per unit (for value analytics) |

### Sample Transactions CSV

\`\`\`csv
Order ID,SKU,Quantity,Order Date,Ship To Company,Ship To City,Ship To State
ORD-2024-001,EVR-BAN-026,50,2024-01-15,Acme Corp,New York,NY
ORD-2024-002,EVR-BAN-026,25,2024-02-20,Beta Inc,Chicago,IL
ORD-2024-003,EVR-PRT-001,200,2024-03-10,Acme Corp,New York,NY
ORD-2024-004,EVR-BAN-027,30,2024-03-15,Gamma LLC,Los Angeles,CA
\`\`\`

---

## Critical: SKU Matching

The **Product ID/SKU must be identical** in both files for the system to link transactions to products.

### Common Matching Issues

| ❌ Problem | Inventory SKU | Transaction SKU | Fix |
|-----------|---------------|-----------------|-----|
| Case mismatch | \`EVR-BAN-026\` | \`evr-ban-026\` | Use consistent case |
| Spacing | \`EVR-BAN-026\` | \`EVR BAN 026\` | Use consistent delimiters |
| Prefix missing | \`EVR-BAN-026\` | \`BAN-026\` | Include full SKU |
| Extra characters | \`EVR-BAN-026\` | \`EVR-BAN-026 \` | Remove trailing spaces |

> **Tip**: Before exporting, run a VLOOKUP in Excel between your inventory and transaction SKUs to verify they match.

---

## How We Calculate Monthly Usage

Once both files are imported, the system automatically calculates usage metrics:

### Calculation Tiers

| Tier | Data Required | Formula | Confidence |
|------|---------------|---------|------------|
| **12-Month Average** | 12+ months of transactions | Weighted average (recent 3 months weighted 1.5x) | ✅ High |
| **6-Month Average** | 6-11 months of transactions | Simple average of 6 months | ⚠️ Medium |
| **3-Month Average** | 3-5 months of transactions | Simple average of 3 months | ⚠️ Medium |
| **Weekly Extrapolation** | < 3 months of transactions | Weekly rate × 4.33 | ⚡ Low |

### Why This Matters

- **Accurate reorder suggestions**: Know exactly when to reorder based on actual usage
- **Stockout prediction**: Get warnings before you run out
- **Budget forecasting**: Plan spending based on consumption patterns
- **Seasonal detection**: Identify products with seasonal demand

---

## How We Use Your Data

### Inventory Intelligence Features

| Feature | What It Does | Data Required |
|---------|--------------|---------------|
| **Stock Health Dashboard** | Color-coded stock status | Inventory + Reorder Points |
| **Low Stock Alerts** | Automatic notifications | Inventory + Reorder Points |
| **Usage Trends** | Monthly consumption charts | Transactions (3+ months) |
| **Reorder Recommendations** | Smart reorder quantities | Both files |
| **Stockout Predictions** | "Will run out in X days" | Both files |
| **Seasonal Analysis** | Identify demand patterns | Transactions (12+ months) |
| **Location Analytics** | Usage by ship-to location | Transactions with ship-to data |

### ML-Powered Forecasting

With 6+ months of transaction data, the system enables:

- **Demand Forecasting**: Predict next month's usage
- **Anomaly Detection**: Flag unusual consumption spikes
- **Optimal Reorder Timing**: Suggest best time to reorder
- **Safety Stock Calculation**: Recommended buffer quantities

---

## Step-by-Step Import Process

### Step 1: Export from Source System

1. Export **Inventory** with all products (even zero-stock items)
2. Export **Transactions** with as much history as available (ideally 12+ months)
3. Verify SKUs match between both files

### Step 2: Import Inventory First

1. Go to **Imports** page
2. Select your client
3. Click **Import Data**
4. Choose **Inventory** as import type
5. Upload your inventory CSV
6. Map columns (system auto-detects most)
7. Confirm and import

### Step 3: Import Transactions

1. Return to **Imports** page
2. Same client selected
3. Click **Import Data**
4. Choose **Transactions** (or **Orders**) as import type
5. Upload your transactions CSV
6. Map columns
7. Confirm and import

### Step 4: Verify Data

After import, check the client's dashboard:

- ✅ Products show correct stock levels
- ✅ Monthly Usage column is populated (not "No data")
- ✅ Usage Tier badge shows calculation method
- ✅ Stockout predictions appear for at-risk items

---

## Troubleshooting

### "Products imported but no monthly usage"

**Cause**: Transaction SKUs don't match inventory SKUs

**Fix**: Check SKU formatting between files. Re-export with consistent SKU format.

### "Some products showing 'No data' for usage"

**Cause**: Those specific SKUs have no matching transactions

**Fix**: Either those products have never been ordered, or the SKU format differs. Verify with a VLOOKUP.

### "Import completed but created new products"

**Cause**: Transaction file contained SKUs not in inventory

**Fix**: This is normal - the system auto-creates products. Update your inventory export to include all SKUs.

### "Usage calculation seems wrong"

**Cause**: Duplicate transactions or incorrect date formats

**Fix**: Check for duplicate Order IDs, ensure dates are in a standard format (YYYY-MM-DD recommended).

---

## Best Practices

### For Initial Setup

- [ ] Export complete inventory (all products, all locations)
- [ ] Export maximum transaction history available (12+ months ideal)
- [ ] Verify SKU format consistency before importing
- [ ] Import inventory FIRST, then transactions

### For Ongoing Maintenance

- [ ] Schedule regular inventory exports (weekly or monthly)
- [ ] Include new transactions in periodic imports
- [ ] Review usage calculations after each import
- [ ] Update reorder points based on actual usage

### Data Quality Checklist

- [ ] No duplicate SKUs in inventory file
- [ ] All SKUs use consistent formatting
- [ ] Dates are in standard format
- [ ] Quantities are numeric (no text like "N/A")
- [ ] No merged cells if exporting from Excel

---

## Need Help?

If you're unsure about your export format or having import issues:

1. Check the **Import Diagnostics** for detailed error messages
2. Contact your operations team with your CSV files
3. We can review your data structure and provide specific guidance

Remember: The more complete and accurate your data, the more valuable insights the system can provide!`,
  },
];

// =============================================================================
// CLIENT HELP ARTICLES
// =============================================================================

const clientArticles = [
  {
    slug: "welcome-client",
    title: "Welcome to Your Portal",
    category: "getting-started",
    audience: "client",
    order: 1,
    isPublished: true,
    excerpt:
      "Get started with your client portal and learn how to manage your inventory.",
    content: `# Welcome to Your Portal

Your client portal gives you real-time access to your inventory, orders, and analytics.

## What You Can Do

- **View Inventory**: See current stock levels for all your products
- **Place Orders**: Submit order requests directly
- **Track Shipments**: Monitor order status and shipments
- **Access Reports**: Download inventory reports and analytics
- **Provide Feedback**: Share insights about product performance

## Quick Start Guide

- [ ] Browse your product catalog
- [ ] Check current stock levels
- [ ] Submit your first order request
- [ ] Set up alert notifications
- [ ] Download a report

## Understanding Stock Status

Products are color-coded by health:

- 🟢 **Healthy**: Well-stocked
- 🔵 **Watch**: Monitor closely
- 🟡 **Low**: Running low
- 🟠 **Critical**: Very low
- 🔴 **Stockout**: Out of stock

## Need Assistance?

Use the search bar above to find specific topics, or browse articles by category on the left.`,
  },
  {
    slug: "viewing-inventory",
    title: "Viewing Your Inventory",
    category: "features",
    audience: "client",
    order: 2,
    isPublished: true,
    excerpt:
      "Learn how to browse products, check stock levels, and use filters.",
    content: `# Viewing Your Inventory

The Products page is your main hub for viewing and managing inventory.

## Product Catalog

Each product card shows:

- Product name and SKU
- Current quantity (packs and units)
- Stock status with color indicator
- Last updated timestamp
- Quick action buttons

## Filtering Products

Use the filters to find what you need:

**By Status**:
- All Products
- Healthy Stock
- Low Stock
- Critical Stock
- Out of Stock

**By Category**:
- All Categories
- Evergreen (regular stock items)
- Special Orders
- Seasonal Items

**Search**: Type product names or SKUs in the search bar

## Understanding Stock Levels

### Packs vs Units

- **Packs**: Number of full packages/cases
- **Units**: Individual items within packs
- Example: "5 packs (120 units)" means 5 cases containing 120 total items

### Stock Status Colors

The color badge indicates current stock health:

- **Green (Healthy)**: Above reorder point, plenty in stock
- **Blue (Watch)**: Getting close to reorder point
- **Yellow (Low)**: Below reorder point, order soon
- **Orange (Critical)**: Very low stock, urgent reorder needed
- **Red (Stockout)**: Completely out of stock

## Quick Actions

- **Reorder**: Quickly add item to order request
- **View Details**: See full product information
- **History**: Check usage and order history

## Best Practices

1. Check your inventory at least weekly
2. Pay attention to Yellow, Orange, and Red items
3. Set up alerts for critical products
4. Review usage trends before reordering`,
  },
  {
    slug: "placing-orders",
    title: "Placing Order Requests",
    category: "how-to",
    audience: "client",
    order: 3,
    isPublished: true,
    excerpt:
      "Step-by-step guide to submitting order requests for your inventory.",
    content: `# Placing Order Requests

Submit order requests directly through your portal for quick, efficient replenishment.

## Creating a New Order Request

### Option 1: From the Products Page

1. Find products you need to reorder
2. Click the **"Reorder"** button on each product
3. Products are added to your order request
4. Click the cart icon to review and submit

### Option 2: New Order Request Page

1. Click **"New Order Request"** in the sidebar
2. Browse and select products
3. Enter quantities needed
4. Add any special instructions
5. Submit for review

## Order Request Form

### Required Information

- **Products**: Which items you need
- **Quantities**: How many of each (packs or units)
- **Priority**: Standard, Urgent, or Critical
- **Delivery Location**: Where to ship

### Optional Information

- Special handling instructions
- Preferred delivery date
- Budget/PO number
- Additional notes

> **Tip**: You can save drafts and come back to complete your order later.

## After Submission

Once submitted, your order request:

1. **Pending Review**: Our team reviews your request
2. **Approved**: Order is processed and scheduled
3. **Shipped**: You'll receive tracking information
4. **Delivered**: Confirm receipt in the portal

## Tracking Your Orders

View all orders from the **Orders** page:

- Filter by status (Pending, Approved, Shipped, Delivered)
- Click any order to see details
- Download order history reports

## Order Request Tips

✅ **Do**:
- Order before reaching critical stock levels
- Group related items in single requests
- Provide accurate delivery information
- Add notes for special requirements

❌ **Don't**:
- Wait until you're completely out of stock
- Submit duplicate requests for same items
- Change delivery address after approval

## Common Questions

**Q: How long does approval take?**
A: Most orders are reviewed within 1 business day.

**Q: Can I cancel an order?**
A: Yes, if it hasn't been approved yet. Contact support for approved orders.

**Q: What if I need something urgently?**
A: Mark the order as "Critical" priority and add a note explaining the urgency.`,
  },
  {
    slug: "understanding-reports",
    title: "Reports and Analytics",
    category: "features",
    audience: "client",
    order: 4,
    isPublished: true,
    excerpt: "Access and understand your inventory reports and analytics.",
    content: `# Reports and Analytics

Your portal provides detailed reports and analytics to help you make informed decisions.

## Available Reports

### Inventory Summary
- Current stock levels across all products
- Stock health distribution
- Items needing attention
- Value of inventory on hand

### Usage Trends
- Product usage over time
- Seasonal patterns
- High-velocity vs slow-moving items
- Forecast future needs

### Order History
- Complete order request history
- Approval times and patterns
- Spending analysis
- Delivery performance

### Low Stock Report
- Items below reorder point
- Estimated days until stockout
- Recommended order quantities
- Cost to replenish

## Accessing Reports

1. Navigate to the **Reports** page
2. Select the report type
3. Choose date range
4. Apply any filters
5. Click **"Generate Report"**

## Downloading Reports

All reports can be downloaded in:

- **PDF**: For printing or sharing
- **Excel**: For further analysis
- **CSV**: For importing into other systems

## Analytics Dashboard

The Analytics page provides visual insights:

### Stock Health Over Time
Track how your inventory health changes month-to-month.

### Product Performance
See which products move fastest and which are slow.

### Order Patterns
Understand your ordering frequency and quantities.

### Cost Analysis
Monitor inventory value and spending trends.

## Using Reports Effectively

### Weekly Review
- Check Low Stock Report
- Review upcoming needs
- Plan order requests

### Monthly Analysis
- Review Usage Trends
- Analyze spending patterns
- Adjust reorder points if needed

### Quarterly Planning
- Look for seasonal patterns
- Identify optimization opportunities
- Plan for busy periods

## Custom Reports

Need a specific report? Contact your account manager to discuss custom reporting options tailored to your needs.`,
  },
];

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seed() {
  console.log("🌱 Seeding help articles...\n");

  try {
    // Seed admin articles
    console.log("📘 Creating admin articles...");
    for (const article of adminArticles) {
      await prisma.documentation.upsert({
        where: { slug: article.slug },
        update: article,
        create: article,
      });
      console.log(`  ✓ ${article.title}`);
    }

    // Seed client articles
    console.log("\n📗 Creating client articles...");
    for (const article of clientArticles) {
      await prisma.documentation.upsert({
        where: { slug: article.slug },
        update: article,
        create: article,
      });
      console.log(`  ✓ ${article.title}`);
    }

    console.log(
      `\n✅ Successfully seeded ${adminArticles.length + clientArticles.length} help articles!`,
    );
    console.log(`   - ${adminArticles.length} admin articles`);
    console.log(`   - ${clientArticles.length} client articles`);
  } catch (error) {
    console.error("❌ Error seeding help articles:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
