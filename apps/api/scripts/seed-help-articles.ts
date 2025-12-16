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
