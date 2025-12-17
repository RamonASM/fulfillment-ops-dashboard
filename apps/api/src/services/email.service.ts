import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../lib/logger.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const EMAIL_FROM =
  process.env.EMAIL_FROM || "Inventory IQ <noreply@inventoryiq.com>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const PORTAL_URL = process.env.PORTAL_URL || "http://localhost:5174";

let transporter: Transporter | null = null;
let emailServiceHealthy = false;

/**
 * Initialize email transporter
 * Supports SMTP, SendGrid, or development (ethereal.email)
 */
export async function initializeEmailService(): Promise<void> {
  if (process.env.NODE_ENV === "development" && !process.env.SMTP_HOST) {
    // Use ethereal.email for development testing
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    emailServiceHealthy = true;
    logger.info("Email service initialized in development mode", {
      host: "smtp.ethereal.email",
      user: testAccount.user,
      previewUrl: "https://ethereal.email/login",
    });
    return;
  }

  // Production SMTP configuration
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Verify connection
  try {
    await transporter.verify();
    emailServiceHealthy = true;
    logger.info("SMTP connection verified", { host: process.env.SMTP_HOST });
  } catch (error) {
    emailServiceHealthy = false;
    logger.error("SMTP connection failed", error as Error, {
      host: process.env.SMTP_HOST,
    });
  }
}

/**
 * Check if email service is healthy
 */
export function isEmailServiceHealthy(): boolean {
  return emailServiceHealthy;
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function baseTemplate(content: string, title: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
    .content { color: #374151; line-height: 1.6; }
    .button { display: inline-block; background: #2563eb; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0; }
    .button:hover { background: #1d4ed8; }
    .alert-critical { border-left: 4px solid #dc2626; padding-left: 16px; margin: 16px 0; }
    .alert-warning { border-left: 4px solid #f59e0b; padding-left: 16px; margin: 16px 0; }
    .alert-info { border-left: 4px solid #3b82f6; padding-left: 16px; margin: 16px 0; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .table th { background: #f9fafb; font-weight: 600; }
    .status-critical { color: #dc2626; font-weight: 600; }
    .status-low { color: #f59e0b; font-weight: 600; }
    .status-healthy { color: #10b981; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">Inventory IQ</div>
      </div>
      <div class="content">
        ${content}
      </div>
    </div>
    <div class="footer">
      <p>Inventory Intelligence Platform</p>
      <p>You're receiving this because you have notifications enabled.</p>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// EMAIL FUNCTIONS
// =============================================================================

/**
 * Send low stock alert email
 */
export async function sendLowStockAlert(
  to: string,
  clientName: string,
  products: Array<{
    name: string;
    productId: string;
    currentStock: number;
    reorderPoint: number;
    status: string;
  }>,
): Promise<void> {
  const criticalCount = products.filter(
    (p) => p.status === "CRITICAL" || p.status === "STOCKOUT",
  ).length;
  const subject =
    criticalCount > 0
      ? `[URGENT] ${criticalCount} Critical Stock Alert${criticalCount > 1 ? "s" : ""} - ${clientName}`
      : `Low Stock Alert - ${clientName}`;

  const productRows = products
    .map(
      (p) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.productId}</td>
      <td class="status-${p.status.toLowerCase()}">${p.status}</td>
      <td>${p.currentStock}</td>
      <td>${p.reorderPoint}</td>
    </tr>
  `,
    )
    .join("");

  const html = baseTemplate(
    `
    <h2>Low Stock Alert for ${clientName}</h2>
    <p>The following products need attention:</p>

    <table class="table">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th>Status</th>
          <th>Current Stock</th>
          <th>Reorder Point</th>
        </tr>
      </thead>
      <tbody>
        ${productRows}
      </tbody>
    </table>

    <a href="${APP_URL}/clients/${clientName}/products" class="button">View in Dashboard</a>
  `,
    subject,
  );

  const text = `Low Stock Alert for ${clientName}\n\n${products.map((p) => `${p.name} (${p.productId}): ${p.status} - ${p.currentStock} units`).join("\n")}`;

  await sendEmail(to, subject, html, text);
}

/**
 * Send order request notification to account manager
 */
export async function sendOrderRequestNotification(
  to: string,
  order: {
    id: string;
    clientName: string;
    requestedBy: string;
    itemCount: number;
    totalItems: number;
  },
): Promise<void> {
  const subject = `New Order Request from ${order.clientName}`;

  const html = baseTemplate(
    `
    <h2>New Order Request</h2>
    <div class="alert-info">
      <p><strong>${order.clientName}</strong> has submitted a new order request.</p>
    </div>

    <p><strong>Requested by:</strong> ${order.requestedBy}</p>
    <p><strong>Items:</strong> ${order.itemCount} products (${order.totalItems} total units)</p>

    <a href="${APP_URL}/orders/${order.id}" class="button">Review Order</a>
  `,
    subject,
  );

  const text = `New order request from ${order.clientName}\nRequested by: ${order.requestedBy}\nItems: ${order.itemCount} products`;

  await sendEmail(to, subject, html, text);
}

/**
 * Send order status update to portal user
 */
export async function sendOrderStatusUpdate(
  to: string,
  order: {
    id: string;
    status: string;
    reviewNotes?: string;
  },
): Promise<void> {
  const statusMessages: Record<
    string,
    { subject: string; message: string; alertClass: string }
  > = {
    APPROVED: {
      subject: "Your Order Request Has Been Approved",
      message:
        "Great news! Your order request has been approved and is being processed.",
      alertClass: "alert-info",
    },
    REJECTED: {
      subject: "Your Order Request Was Not Approved",
      message:
        "Unfortunately, your order request could not be approved at this time.",
      alertClass: "alert-warning",
    },
    FULFILLED: {
      subject: "Your Order Has Been Fulfilled",
      message: "Your order has been fulfilled and shipped.",
      alertClass: "alert-info",
    },
    CHANGES_REQUESTED: {
      subject: "Changes Requested for Your Order",
      message:
        "Your order request needs some revisions before it can be processed. Please review the notes and update your request.",
      alertClass: "alert-warning",
    },
    ACKNOWLEDGED: {
      subject: "Your Order Request Has Been Acknowledged",
      message:
        "Your order request has been received and is being reviewed by our team.",
      alertClass: "alert-info",
    },
  };

  const status = statusMessages[order.status] || {
    subject: `Order Status Update: ${order.status}`,
    message: `Your order status has been updated to ${order.status}.`,
    alertClass: "alert-info",
  };

  const html = baseTemplate(
    `
    <h2>${status.subject}</h2>
    <div class="${status.alertClass}">
      <p>${status.message}</p>
    </div>

    ${order.reviewNotes ? `<p><strong>Notes:</strong> ${order.reviewNotes}</p>` : ""}

    <a href="${PORTAL_URL}/orders/${order.id}" class="button">View Order Details</a>
  `,
    status.subject,
  );

  const text = `${status.subject}\n\n${status.message}${order.reviewNotes ? `\n\nNotes: ${order.reviewNotes}` : ""}`;

  await sendEmail(to, status.subject, html, text);
}

/**
 * Send order deadline alert email
 */
export async function sendOrderDeadlineAlert(
  to: string,
  clientName: string,
  products: Array<{
    name: string;
    currentStock: number;
    daysUntilDeadline: number;
    orderByDate: string;
  }>,
): Promise<void> {
  const urgentProducts = products.filter((p) => p.daysUntilDeadline <= 0);
  const criticalProducts = products.filter(
    (p) => p.daysUntilDeadline > 0 && p.daysUntilDeadline <= 3,
  );

  const subject =
    urgentProducts.length > 0
      ? `🚨 URGENT: Order Deadlines Passed for ${clientName}`
      : `⚠️ Order Deadlines Approaching for ${clientName}`;

  const urgentRows = urgentProducts
    .map(
      (p) => `
    <tr style="background: #fee2e2;">
      <td><strong>${p.name}</strong></td>
      <td>${p.currentStock} units</td>
      <td>${p.orderByDate}</td>
      <td><strong class="status-critical">${Math.abs(p.daysUntilDeadline)} days overdue</strong></td>
    </tr>
  `,
    )
    .join("");

  const criticalRows = criticalProducts
    .map(
      (p) => `
    <tr style="background: #fef3c7;">
      <td><strong>${p.name}</strong></td>
      <td>${p.currentStock} units</td>
      <td>${p.orderByDate}</td>
      <td><strong class="status-low">${p.daysUntilDeadline} days remaining</strong></td>
    </tr>
  `,
    )
    .join("");

  const html = baseTemplate(
    `
    <h2>⏰ Order Deadline Alert</h2>
    <p>The following products for <strong>${clientName}</strong> have approaching or passed order deadlines:</p>

    ${
      urgentProducts.length > 0
        ? `
      <h3 style="color: #dc2626;">🚨 OVERDUE (Order Immediately)</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Current Stock</th>
            <th>Order By</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${urgentRows}
        </tbody>
      </table>
    `
        : ""
    }

    ${
      criticalProducts.length > 0
        ? `
      <h3 style="color: #f59e0b;">⚠️ CRITICAL (Order Within ${Math.max(...criticalProducts.map((p) => p.daysUntilDeadline))} Days)</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Current Stock</th>
            <th>Order By</th>
            <th>Days Remaining</th>
          </tr>
        </thead>
        <tbody>
          ${criticalRows}
        </tbody>
      </table>
    `
        : ""
    }

    <p style="margin-top: 20px;">
      <a href="${PORTAL_URL}" class="button">Place Order Now</a>
    </p>
  `,
    subject,
  );

  const text =
    `Order Deadline Alert for ${clientName}\n\n` +
    (urgentProducts.length > 0
      ? `OVERDUE:\n${urgentProducts.map((p) => `${p.name}: ${Math.abs(p.daysUntilDeadline)} days overdue (Order by: ${p.orderByDate})`).join("\n")}\n\n`
      : "") +
    (criticalProducts.length > 0
      ? `CRITICAL:\n${criticalProducts.map((p) => `${p.name}: ${p.daysUntilDeadline} days remaining (Order by: ${p.orderByDate})`).join("\n")}`
      : "");

  await sendEmail(to, subject, html, text);
}

/**
 * Send weekly digest email
 */
export async function sendWeeklyDigest(
  to: string,
  digest: {
    userName: string;
    period: string;
    summary: {
      totalClients: number;
      healthyClients: number;
      atRiskClients: number;
      totalAlerts: number;
      criticalAlerts: number;
      resolvedAlerts: number;
    };
    topIssues: Array<{ client: string; issue: string; severity: string }>;
  },
): Promise<void> {
  const subject = `Weekly Inventory Digest - ${digest.period}`;

  const issueRows =
    digest.topIssues
      .map(
        (i) => `
    <tr>
      <td>${i.client}</td>
      <td class="status-${i.severity.toLowerCase()}">${i.issue}</td>
    </tr>
  `,
      )
      .join("") || '<tr><td colspan="2">No issues this week!</td></tr>';

  const html = baseTemplate(
    `
    <h2>Weekly Digest</h2>
    <p>Hi ${digest.userName}, here's your inventory summary for ${digest.period}:</p>

    <h3>Client Health</h3>
    <p>
      <span class="status-healthy">${digest.summary.healthyClients} Healthy</span> |
      <span class="status-low">${digest.summary.atRiskClients} At Risk</span> |
      ${digest.summary.totalClients} Total
    </p>

    <h3>Alerts</h3>
    <p>
      <span class="status-critical">${digest.summary.criticalAlerts} Critical</span> |
      ${digest.summary.totalAlerts} Total |
      <span class="status-healthy">${digest.summary.resolvedAlerts} Resolved</span>
    </p>

    <h3>Top Issues</h3>
    <table class="table">
      <thead>
        <tr>
          <th>Client</th>
          <th>Issue</th>
        </tr>
      </thead>
      <tbody>
        ${issueRows}
      </tbody>
    </table>

    <a href="${APP_URL}" class="button">Open Dashboard</a>
  `,
    subject,
  );

  const text = `Weekly Digest for ${digest.userName}\n\nClients: ${digest.summary.healthyClients} healthy, ${digest.summary.atRiskClients} at risk\nAlerts: ${digest.summary.criticalAlerts} critical, ${digest.summary.resolvedAlerts} resolved`;

  await sendEmail(to, subject, html, text);
}

// =============================================================================
// CORE SEND FUNCTION
// =============================================================================

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  if (!transporter) {
    logger.warn("Email transporter not initialized, skipping email", {
      to,
      subject,
    });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });

    logger.info("Email sent", { to, subject });

    // Log preview URL for ethereal.email (development)
    if (process.env.NODE_ENV === "development") {
      logger.debug("Email preview available", {
        previewUrl: nodemailer.getTestMessageUrl(info),
      });
    }
  } catch (error) {
    logger.error("Failed to send email", error as Error, { to, subject });
    throw error;
  }
}

export { sendEmail };
