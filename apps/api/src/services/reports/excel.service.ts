import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';

interface ExportOptions {
  includeHistory?: boolean;
  dateRange?: { start: Date; end: Date };
}

// =============================================================================
// INVENTORY EXPORT
// =============================================================================

export async function generateInventoryExcel(
  clientId: string,
  options?: ExportOptions
): Promise<Buffer> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new Error('Client not found');

  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ stockStatus: 'asc' }, { name: 'asc' }],
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inventory IQ';
  workbook.created = new Date();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 25 },
    { header: 'Value', key: 'value', width: 15 },
  ];

  const summary = [
    { metric: 'Client', value: client.name },
    { metric: 'Report Date', value: new Date().toLocaleDateString() },
    { metric: 'Total Products', value: products.length },
    { metric: 'Healthy', value: products.filter((p) => p.stockStatus === 'HEALTHY').length },
    { metric: 'Watch', value: products.filter((p) => p.stockStatus === 'WATCH').length },
    { metric: 'Low Stock', value: products.filter((p) => p.stockStatus === 'LOW').length },
    { metric: 'Critical', value: products.filter((p) => p.stockStatus === 'CRITICAL').length },
    { metric: 'Stockout', value: products.filter((p) => p.stockStatus === 'STOCKOUT').length },
  ];

  summary.forEach((row) => summarySheet.addRow(row));
  styleHeader(summarySheet);

  // Products Sheet
  const productsSheet = workbook.addWorksheet('Products');

  productsSheet.columns = [
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'SKU', key: 'productId', width: 15 },
    { header: 'Item Type', key: 'itemType', width: 15 },
    { header: 'Current Stock (Packs)', key: 'currentStockPacks', width: 18 },
    { header: 'Current Stock (Units)', key: 'currentStockUnits', width: 18 },
    { header: 'Pack Size', key: 'packSize', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Weeks Remaining', key: 'weeksRemaining', width: 15 },
    { header: 'Avg Daily Usage', key: 'avgDailyUsage', width: 15 },
    { header: 'Last Updated', key: 'updatedAt', width: 18 },
  ];

  products.forEach((product) => {
    productsSheet.addRow({
      name: product.name,
      productId: product.productId,
      itemType: product.itemType || 'evergreen',
      currentStockPacks: product.currentStockPacks || 0,
      currentStockUnits: product.currentStockUnits || 0,
      packSize: product.packSize || 1,
      status: product.stockStatus || 'HEALTHY',
      weeksRemaining: product.weeksRemaining || '-',
      avgDailyUsage: product.avgDailyUsage?.toFixed(2) || '-',
      updatedAt: product.updatedAt.toLocaleDateString(),
    });
  });

  styleHeader(productsSheet);
  productsSheet.autoFilter = 'A1:J1';

  // Stock History Sheet (if requested)
  if (options?.includeHistory) {
    const historySheet = workbook.addWorksheet('Stock History');

    historySheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Product', key: 'product', width: 30 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Packs Available', key: 'packsAvailable', width: 15 },
      { header: 'Total Units', key: 'totalUnits', width: 15 },
    ];

    const stockHistory = await prisma.stockHistory.findMany({
      where: { product: { clientId } },
      include: { product: { select: { name: true, productId: true } } },
      orderBy: { recordedAt: 'desc' },
      take: 1000,
    });

    stockHistory.forEach((record) => {
      historySheet.addRow({
        date: record.recordedAt.toLocaleDateString(),
        product: record.product.name,
        sku: record.product.productId,
        packsAvailable: record.packsAvailable,
        totalUnits: record.totalUnits,
      });
    });

    styleHeader(historySheet);
    historySheet.autoFilter = 'A1:E1';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// TRANSACTIONS EXPORT
// =============================================================================

export async function generateTransactionsExcel(
  clientId: string,
  options?: ExportOptions
): Promise<Buffer> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) throw new Error('Client not found');

  const transactions = await prisma.transaction.findMany({
    where: {
      product: { clientId },
      ...(options?.dateRange ? {
        dateSubmitted: {
          gte: options.dateRange.start,
          lte: options.dateRange.end,
        },
      } : {}),
    },
    include: { product: { select: { name: true, productId: true } } },
    orderBy: { dateSubmitted: 'desc' },
    take: 5000,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inventory IQ';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transactions');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Product', key: 'product', width: 30 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Order ID', key: 'orderId', width: 15 },
    { header: 'Quantity (Packs)', key: 'quantityPacks', width: 15 },
    { header: 'Quantity (Units)', key: 'quantityUnits', width: 15 },
    { header: 'Status', key: 'orderStatus', width: 12 },
    { header: 'Ship To', key: 'shipTo', width: 25 },
  ];

  transactions.forEach((tx) => {
    sheet.addRow({
      date: tx.dateSubmitted.toLocaleDateString(),
      product: tx.product.name,
      sku: tx.product.productId,
      orderId: tx.orderId,
      quantityPacks: tx.quantityPacks,
      quantityUnits: tx.quantityUnits,
      orderStatus: tx.orderStatus,
      shipTo: tx.shipToCompany || tx.shipToLocation || '-',
    });
  });

  styleHeader(sheet);
  sheet.autoFilter = 'A1:H1';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// ALERTS EXPORT
// =============================================================================

export async function generateAlertsExcel(
  clientId: string,
  options?: ExportOptions
): Promise<Buffer> {
  const alerts = await prisma.alert.findMany({
    where: {
      clientId,
      ...(options?.dateRange ? {
        createdAt: {
          gte: options.dateRange.start,
          lte: options.dateRange.end,
        },
      } : {}),
    },
    include: { product: { select: { name: true, productId: true } } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inventory IQ';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Alerts');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Severity', key: 'severity', width: 12 },
    { header: 'Product', key: 'product', width: 30 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Title', key: 'title', width: 30 },
    { header: 'Message', key: 'message', width: 50 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  alerts.forEach((alert) => {
    sheet.addRow({
      date: alert.createdAt.toLocaleDateString(),
      type: alert.alertType,
      severity: alert.severity,
      product: alert.product?.name || '-',
      sku: alert.product?.productId || '-',
      title: alert.title,
      message: alert.message || '-',
      status: alert.isRead ? 'Read' : 'Unread',
    });
  });

  styleHeader(sheet);
  sheet.autoFilter = 'A1:H1';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// =============================================================================
// CSV EXPORT
// =============================================================================

export async function generateInventoryCSV(clientId: string): Promise<string> {
  const products = await prisma.product.findMany({
    where: { clientId, isActive: true },
    orderBy: [{ stockStatus: 'asc' }, { name: 'asc' }],
  });

  const headers = ['Product Name', 'SKU', 'Item Type', 'Current Stock (Packs)', 'Current Stock (Units)', 'Pack Size', 'Status', 'Weeks Remaining', 'Avg Daily Usage'];
  const rows = products.map((p) => [
    `"${p.name.replace(/"/g, '""')}"`,
    p.productId,
    p.itemType || 'evergreen',
    p.currentStockPacks || 0,
    p.currentStockUnits || 0,
    p.packSize || 1,
    p.stockStatus || 'HEALTHY',
    p.weeksRemaining || '',
    p.avgDailyUsage?.toFixed(2) || '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// =============================================================================
// HELPERS
// =============================================================================

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF2563EB' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
