import { prisma } from '../lib/prisma.js';
import type { Four51Order } from './four51-cxml.service.js';
import {
  buildPrintMergeRows,
  serializePrintMergeCsv,
  type StoredPrintOrder,
} from './reports/print-merge.service.js';

/**
 * Persistence + DB-backed export for Four51 print orders.
 *
 * The cXML listener calls persistFour51Order (idempotent on clientId + Four51
 * order id). getStoredPrintMergeCsv reads those rows back out as a CorelDRAW
 * Print Merge file, reusing the shared row/column contract.
 */

export interface PersistResult {
  created: boolean;
  printOrderId: string;
}

function toValidDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Truncate to a column width so partner-controlled cXML values can't blow a VarChar limit
 *  (which would 500 the webhook and trigger an endless Four51 retry loop). */
function clamp(value: string | null, max: number): string | null {
  if (value === null) return null;
  return value.length <= max ? value : value.slice(0, max);
}

export async function persistFour51Order(
  order: Four51Order,
  clientId: string,
  rawXml: string
): Promise<PersistResult> {
  const data = {
    source: 'four51_cxml',
    orderType: clamp(order.orderType, 50),
    status: 'received',
    orderDate: toValidDate(order.orderDate),
    totalAmount: clamp(order.total, 50),
    currency: clamp(order.currency, 10),
    shipToCompany: clamp(order.shipToCompany, 255),
    shipToName: clamp(order.shipToName, 255),
    shipToCity: clamp(order.shipToCity, 255),
    shipToState: clamp(order.shipToState, 100),
    payloadId: clamp(order.payloadId, 255),
    rawCxml: rawXml,
  };

  return prisma.$transaction(async (tx) => {
    const where = { clientId_four51OrderId: { clientId, four51OrderId: order.orderId } };

    const printOrder = await tx.printOrder.upsert({
      where,
      update: data,
      create: { clientId, four51OrderId: order.orderId, ...data },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    // Replace lines so re-deliveries (Four51 retries) stay consistent.
    await tx.printOrderLine.deleteMany({ where: { printOrderId: printOrder.id } });
    if (order.lines.length > 0) {
      await tx.printOrderLine.createMany({
        data: order.lines.map((line) => ({
          printOrderId: printOrder.id,
          lineNumber: line.lineNumber,
          productId: clamp(line.productId, 100) ?? '',
          variantId: clamp(line.variantId, 100),
          description: clamp(line.description, 255),
          productType: clamp(line.productType, 50),
          quantity: line.quantity,
          quantityMultiplier: line.quantityMultiplier,
          unitPrice: clamp(line.unitPrice, 50),
          titleLine1: clamp(line.titleLine1, 500),
          titleLine2: clamp(line.titleLine2, 500),
          specs: line.specs,
          productionPdfUrl: clamp(line.productionPdfUrl, 1000),
        })),
      });
    }

    // Freshly created rows have createdAt === updatedAt; avoids a pre-read race.
    const created = printOrder.createdAt.getTime() === printOrder.updatedAt.getTime();
    return { created, printOrderId: printOrder.id };
  });
}

export async function getStoredPrintMergeCsv(
  clientId: string
): Promise<{ csv: string; rowCount: number }> {
  const orders = await prisma.printOrder.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: { lines: { orderBy: { lineNumber: 'asc' } } },
  });

  const stored: StoredPrintOrder[] = orders.map((o) => ({
    four51OrderId: o.four51OrderId,
    orderDate: o.orderDate,
    shipToCompany: o.shipToCompany,
    shipToName: o.shipToName,
    shipToCity: o.shipToCity,
    shipToState: o.shipToState,
    lines: o.lines.map((l) => ({
      lineNumber: l.lineNumber,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      quantityMultiplier: l.quantityMultiplier,
      titleLine1: l.titleLine1,
      titleLine2: l.titleLine2,
      specs: (l.specs as Record<string, unknown>) ?? {},
    })),
  }));

  const rows = buildPrintMergeRows(stored);
  return { csv: serializePrintMergeCsv(rows), rowCount: rows.length };
}
