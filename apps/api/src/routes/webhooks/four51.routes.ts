import { Router, Request, Response } from 'express';
import express from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../../lib/logger.js';
import { parseFour51Cxml } from '../../services/four51-cxml.service.js';
import { persistFour51Order } from '../../services/four51-print-order.service.js';

/**
 * Four51 cXML Order Request listener.
 *
 * Four51 POSTs the raw cXML OrderRequest as the request body. We authenticate
 * via the SharedSecret carried in the cXML Sender credential, persist the order
 * idempotently, and return a cXML <Response><Status code="200"/>.
 *
 * Mounted under /api/webhooks/four51 — already CSRF-exempt and unauthenticated
 * by design (verified by signature instead).
 *
 * Required env: FOUR51_CLIENT_ID (internal client UUID to attach orders to),
 * FOUR51_SHARED_SECRET. Optional: FOUR51_ALLOWED_IPS (comma-separated allowlist).
 */

const router = Router();

// Four51 sends the cXML as the raw body. Parse any content type as text for
// this route only, so we always capture the unmodified document.
router.use(express.text({ type: () => true, limit: '5mb' }));

function xmlEscape(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function cxmlResponse(code: number, text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<cXML><Response><Status code="${code}" text="${xmlEscape(text)}"/></Response></cXML>`;
}

function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function ipAllowed(req: Request): boolean {
  const allow = (process.env.FOUR51_ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return true; // not configured -> skip IP check
  const ip = req.ip || '';
  return allow.includes(ip); // exact match; defense-in-depth behind the shared secret
}

router.post('/', async (req: Request, res: Response) => {
  res.type('application/xml');

  if (!ipAllowed(req)) {
    logger.warn('Four51 webhook rejected: source IP not allowed', { ip: req.ip });
    res.status(403).send(cxmlResponse(401, 'Unauthorized'));
    return;
  }

  const clientId = process.env.FOUR51_CLIENT_ID;
  const expectedSecret = process.env.FOUR51_SHARED_SECRET;
  if (!clientId || !expectedSecret) {
    logger.error('Four51 webhook not configured: FOUR51_CLIENT_ID / FOUR51_SHARED_SECRET missing');
    res.status(500).send(cxmlResponse(500, 'Webhook not configured'));
    return;
  }

  const xml = typeof req.body === 'string' ? req.body : '';
  if (!xml.trim()) {
    res.status(400).send(cxmlResponse(400, 'Empty body'));
    return;
  }

  let order;
  try {
    order = parseFour51Cxml(xml);
  } catch (error) {
    logger.warn('Four51 webhook: unparseable cXML', { message: (error as Error).message });
    res.status(406).send(cxmlResponse(406, 'Not parseable'));
    return;
  }

  if (!order.sharedSecret || !secretsMatch(order.sharedSecret, expectedSecret)) {
    logger.warn('Four51 webhook rejected: shared secret mismatch', { orderId: order.orderId });
    res.status(401).send(cxmlResponse(401, 'Unauthorized'));
    return;
  }

  try {
    const result = await persistFour51Order(order, clientId, xml);
    logger.info('Four51 order received', {
      orderId: order.orderId,
      lines: order.lines.length,
      created: result.created,
    });
    res.status(200).send(cxmlResponse(200, 'OK'));
  } catch (error) {
    logger.error('Four51 webhook: persistence failed', error as Error);
    res.status(500).send(cxmlResponse(500, 'Internal error'));
  }
});

export default router;
