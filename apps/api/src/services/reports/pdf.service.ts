import PDFDocument from 'pdfkit';
import { prisma } from '../../lib/prisma.js';

interface ReportOptions {
  title: string;
  subtitle?: string;
  dateRange?: { start: Date; end: Date };
}

// =============================================================================
// COLORS & STYLES
// =============================================================================

const COLORS = {
  primary: '#2563EB',
  healthy: '#10B981',
  watch: '#3B82F6',
  low: '#F59E0B',
  critical: '#DC2626',
  stockout: '#991B1B',
  text: '#374151',
  lightGray: '#F3F4F6',
  border: '#E5E7EB',
};

// =============================================================================
// INVENTORY STATUS REPORT
// =============================================================================

export async function generateInventoryStatusPDF(
  clientId: string,
  options?: Partial<ReportOptions>
): Promise<Buffer> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new Error('Client not found');

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ stockStatus: 'asc' }, { name: 'asc' }],
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  // Header
  addHeader(doc, {
    title: options?.title || `Inventory Status Report`,
    subtitle: client.name,
  });

  // Summary Section
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor(COLORS.text).text('Summary', { underline: true });
  doc.moveDown(0.3);

  const summary = {
    total: products.length,
    healthy: products.filter((p) => p.stockStatus === 'HEALTHY').length,
    watch: products.filter((p) => p.stockStatus === 'WATCH').length,
    low: products.filter((p) => p.stockStatus === 'LOW').length,
    critical: products.filter((p) => p.stockStatus === 'CRITICAL').length,
    stockout: products.filter((p) => p.stockStatus === 'STOCKOUT').length,
  };

  const summaryY = doc.y;
  doc.fontSize(10);
  doc.fillColor(COLORS.healthy).text(`● Healthy: ${summary.healthy}`, 50, summaryY);
  doc.fillColor(COLORS.watch).text(`● Watch: ${summary.watch}`, 150, summaryY);
  doc.fillColor(COLORS.low).text(`● Low: ${summary.low}`, 250, summaryY);
  doc.fillColor(COLORS.critical).text(`● Critical: ${summary.critical}`, 350, summaryY);
  doc.fillColor(COLORS.stockout).text(`● Stockout: ${summary.stockout}`, 450, summaryY);

  doc.moveDown(2);

  // Product Table
  doc.fontSize(14).fillColor(COLORS.text).text('Product Details', { underline: true });
  doc.moveDown(0.5);

  // Table Header
  const tableTop = doc.y;
  const colWidths = [150, 80, 70, 70, 80, 70];
  const headers = ['Product', 'SKU', 'Stock', 'Reorder Pt', 'Status', 'Weeks Left'];

  doc.fontSize(9).fillColor(COLORS.primary);
  let xPos = 50;
  headers.forEach((header, i) => {
    doc.text(header, xPos, tableTop, { width: colWidths[i] });
    xPos += colWidths[i];
  });

  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke(COLORS.border);

  // Table Rows
  let rowY = tableTop + 20;
  doc.fontSize(8).fillColor(COLORS.text);

  for (const product of products) {
    if (rowY > 750) {
      doc.addPage();
      rowY = 50;
    }

    xPos = 50;
    doc.text(product.name.substring(0, 25), xPos, rowY, { width: colWidths[0] });
    xPos += colWidths[0];
    doc.text(product.productId, xPos, rowY, { width: colWidths[1] });
    xPos += colWidths[1];
    doc.text(String(product.currentStockUnits || 0), xPos, rowY, { width: colWidths[2] });
    xPos += colWidths[2];
    doc.text(String(product.reorderPointPacks || 0), xPos, rowY, { width: colWidths[3] });
    xPos += colWidths[3];

    // Status with color
    const statusColor = getStatusColor(product.stockStatus || 'HEALTHY');
    doc.fillColor(statusColor).text(product.stockStatus || 'HEALTHY', xPos, rowY, { width: colWidths[4] });
    xPos += colWidths[4];

    doc.fillColor(COLORS.text).text(
      product.weeksRemaining ? `${product.weeksRemaining.toFixed(1)}` : '-',
      xPos,
      rowY,
      { width: colWidths[5] }
    );

    rowY += 15;
  }

  // Footer
  addFooter(doc);

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// =============================================================================
// ALERT REPORT
// =============================================================================

export async function generateAlertReportPDF(
  clientId: string,
  options?: Partial<ReportOptions>
): Promise<Buffer> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new Error('Client not found');

  const dateFilter = options?.dateRange
    ? {
        createdAt: {
          gte: options.dateRange.start,
          lte: options.dateRange.end,
        },
      }
    : {};

  const alerts = await prisma.alert.findMany({
    where: { clientId, ...dateFilter },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  addHeader(doc, {
    title: options?.title || 'Alert Report',
    subtitle: client.name,
  });

  doc.moveDown(0.5);

  // Summary
  const summary = {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
    warning: alerts.filter((a) => a.severity === 'WARNING').length,
    info: alerts.filter((a) => a.severity === 'INFO').length,
    unresolved: alerts.filter((a) => !a.isRead).length,
  };

  doc.fontSize(10).fillColor(COLORS.text);
  doc.text(`Total Alerts: ${summary.total} | Critical: ${summary.critical} | Warning: ${summary.warning} | Unresolved: ${summary.unresolved}`);
  doc.moveDown(1);

  // Alert List
  for (const alert of alerts) {
    if (doc.y > 720) {
      doc.addPage();
    }

    const severityColor =
      alert.severity === 'CRITICAL' ? COLORS.critical :
      alert.severity === 'WARNING' ? COLORS.low : COLORS.watch;

    doc.fontSize(9).fillColor(severityColor).text(`[${alert.severity}]`, { continued: true });
    doc.fillColor(COLORS.text).text(` ${alert.alertType} - ${alert.message}`);
    doc.fontSize(8).fillColor('#9CA3AF');
    doc.text(`${alert.product?.name || 'N/A'} | ${new Date(alert.createdAt).toLocaleDateString()}`);
    doc.moveDown(0.5);
  }

  addFooter(doc);
  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// =============================================================================
// ORDER HISTORY REPORT
// =============================================================================

export async function generateOrderHistoryPDF(
  clientId: string,
  options?: Partial<ReportOptions>
): Promise<Buffer> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new Error('Client not found');

  const orders = await prisma.orderRequest.findMany({
    where: { clientId },
    include: {
      requestedBy: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  addHeader(doc, {
    title: options?.title || 'Order History Report',
    subtitle: client.name,
  });

  doc.moveDown(0.5);

  const summary = {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'PENDING').length,
    approved: orders.filter((o) => o.status === 'APPROVED').length,
    rejected: orders.filter((o) => o.status === 'REJECTED').length,
  };

  doc.fontSize(10).fillColor(COLORS.text);
  doc.text(`Total Orders: ${summary.total} | Pending: ${summary.pending} | Approved: ${summary.approved} | Rejected: ${summary.rejected}`);
  doc.moveDown(1);

  // Order Table
  const tableTop = doc.y;
  const colWidths = [80, 100, 80, 80, 100];
  const headers = ['Order ID', 'Requested By', 'Status', 'Date', 'Notes'];

  doc.fontSize(9).fillColor(COLORS.primary);
  let xPos = 50;
  headers.forEach((header, i) => {
    doc.text(header, xPos, tableTop, { width: colWidths[i] });
    xPos += colWidths[i];
  });

  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke(COLORS.border);

  let rowY = tableTop + 20;
  doc.fontSize(8).fillColor(COLORS.text);

  for (const order of orders) {
    if (rowY > 750) {
      doc.addPage();
      rowY = 50;
    }

    xPos = 50;
    doc.text(order.id.substring(0, 8), xPos, rowY, { width: colWidths[0] });
    xPos += colWidths[0];
    doc.text(order.requestedBy?.name || 'Unknown', xPos, rowY, { width: colWidths[1] });
    xPos += colWidths[1];

    const statusColor =
      order.status === 'APPROVED' ? COLORS.healthy :
      order.status === 'REJECTED' ? COLORS.critical : COLORS.low;
    doc.fillColor(statusColor).text(order.status, xPos, rowY, { width: colWidths[2] });
    xPos += colWidths[2];

    doc.fillColor(COLORS.text);
    doc.text(new Date(order.createdAt).toLocaleDateString(), xPos, rowY, { width: colWidths[3] });
    xPos += colWidths[3];
    doc.text((order.notes || '-').substring(0, 20), xPos, rowY, { width: colWidths[4] });

    rowY += 15;
  }

  addFooter(doc);
  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// =============================================================================
// HELPERS
// =============================================================================

function addHeader(doc: PDFKit.PDFDocument, options: ReportOptions): void {
  doc.fontSize(20).fillColor(COLORS.primary).text(options.title, { align: 'center' });
  if (options.subtitle) {
    doc.fontSize(12).fillColor(COLORS.text).text(options.subtitle, { align: 'center' });
  }
  doc.fontSize(10).fillColor('#9CA3AF').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(COLORS.border);
}

function addFooter(doc: PDFKit.PDFDocument): void {
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#9CA3AF');
    doc.text(
      `Page ${i + 1} of ${pageCount} | Inventory IQ`,
      50,
      doc.page.height - 30,
      { align: 'center', width: doc.page.width - 100 }
    );
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    HEALTHY: COLORS.healthy,
    WATCH: COLORS.watch,
    LOW: COLORS.low,
    CRITICAL: COLORS.critical,
    STOCKOUT: COLORS.stockout,
  };
  return colors[status] || COLORS.text;
}
