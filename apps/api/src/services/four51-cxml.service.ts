import { XMLParser } from 'fast-xml-parser';

/**
 * Parse a Four51 cXML OrderRequest into a normalized order with per-line
 * variable text already separated into TitleLine1 / TitleLine2.
 *
 * The personalization lives in a nested Extrinsic:
 *   ItemOut/ItemDetail/Extrinsic[@name="ProductSpecs"]/Extrinsic[@name="<spec>"]
 * Spec names are catalog-defined and arbitrary, so we keep the full spec map and
 * additionally surface the title lines by name-matching. Pure / no DB.
 */

export interface Four51OrderLine {
  lineNumber: number;
  productId: string;
  variantId: string | null;
  description: string | null;
  productType: string | null;
  quantity: number;
  quantityMultiplier: number;
  unitPrice: string | null;
  productionPdfUrl: string | null;
  titleLine1: string | null;
  titleLine2: string | null;
  specs: Record<string, string>;
}

export interface Four51Order {
  orderId: string;
  orderType: string | null;
  orderDate: string | null;
  payloadId: string | null;
  total: string | null;
  currency: string | null;
  /** SharedSecret from the Sender credential, used to authenticate the webhook. */
  sharedSecret: string | null;
  shipToCompany: string | null;
  shipToName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  lines: Four51OrderLine[];
}

const TEXT = '#text';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: TEXT,
  parseTagValue: false, // keep IDs/prices as strings
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false, // untrusted input: don't expand DTD entities (XML-bomb defense)
});

type XmlNode = unknown;

function toArray(value: XmlNode): XmlNode[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: XmlNode): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Decode the 5 predefined XML entities + numeric refs. We keep the parser's
// DTD entity processing OFF (XML-bomb defense) and decode these standard
// entities ourselves, so an imprint of "Mom &amp; Dad" prints as "Mom & Dad".
function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, ent: string) => {
    switch (ent) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const isHex = ent[1] === 'x' || ent[1] === 'X';
        const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
    }
  });
}

function clean(value: string): string | null {
  const decoded = decodeXmlEntities(value).trim();
  return decoded || null;
}

/** A node can be a bare string or an object carrying attributes + a #text child. */
function textOf(node: XmlNode): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === 'string') return clean(node);
  if (typeof node === 'number') return String(node);
  if (isRecord(node)) {
    const t = node[TEXT];
    if (typeof t === 'string') return clean(t);
    if (typeof t === 'number') return String(t);
  }
  return null;
}

function attr(node: XmlNode, name: string): string | null {
  if (isRecord(node)) {
    const v = node[`@_${name}`];
    if (typeof v === 'string') return clean(v);
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function get(node: XmlNode, key: string): XmlNode {
  return isRecord(node) ? node[key] : undefined;
}

function toInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize a spec name for matching: lowercase, strip non-alphanumerics. */
function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build a {name: value} map from an array of <Extrinsic name="x">v</Extrinsic>. */
function extrinsicTextMap(extrinsics: XmlNode[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const ex of extrinsics) {
    const name = attr(ex, 'name');
    const value = textOf(ex);
    if (name && value !== null) map[name] = value;
  }
  return map;
}

function findExtrinsic(extrinsics: XmlNode[], name: string): XmlNode {
  const target = normalizeKey(name);
  return extrinsics.find((ex) => {
    const n = attr(ex, 'name');
    return n !== null && normalizeKey(n) === target;
  });
}

function pickTitleLines(specs: Record<string, string>): { titleLine1: string | null; titleLine2: string | null } {
  let titleLine1: string | null = null;
  let titleLine2: string | null = null;
  for (const [name, value] of Object.entries(specs)) {
    const key = normalizeKey(name);
    if (key === 'titleline1' || key === 'line1') titleLine1 = value;
    else if (key === 'titleline2' || key === 'line2') titleLine2 = value;
  }
  return { titleLine1, titleLine2 };
}

function parseShipTo(address: XmlNode): {
  company: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
} {
  const postal = get(address, 'PostalAddress');
  return {
    company: attr(postal, 'name') ?? textOf(get(address, 'Name')),
    name: textOf(get(postal, 'DeliverTo')),
    city: textOf(get(postal, 'City')),
    state: textOf(get(postal, 'State')),
  };
}

function parseLine(itemOut: XmlNode): Four51OrderLine {
  const itemId = get(itemOut, 'ItemID');
  const detail = get(itemOut, 'ItemDetail');
  const detailExtrinsics = toArray(get(detail, 'Extrinsic'));

  const productSpecsNode = findExtrinsic(detailExtrinsics, 'ProductSpecs');
  const specChildren = toArray(get(productSpecsNode, 'Extrinsic'));
  const specs = extrinsicTextMap(specChildren);
  const { titleLine1, titleLine2 } = pickTitleLines(specs);

  const money = get(get(detail, 'UnitPrice'), 'Money');

  return {
    lineNumber: toInt(attr(itemOut, 'lineNumber'), 0),
    productId: textOf(get(itemId, 'SupplierPartID')) ?? '',
    variantId: textOf(get(itemId, 'SupplierPartAuxiliaryID')),
    description: textOf(get(detail, 'Description')),
    productType: textOf(findExtrinsic(detailExtrinsics, 'productType')),
    quantity: toInt(attr(itemOut, 'quantity'), 0),
    quantityMultiplier: toInt(textOf(findExtrinsic(detailExtrinsics, 'quantityMultiplier')), 1),
    unitPrice: textOf(money),
    productionPdfUrl: textOf(get(detail, 'URL')),
    titleLine1,
    titleLine2,
    specs,
  };
}

export function parseFour51Cxml(xml: string): Four51Order {
  const root = parser.parse(xml);
  const cxml = get(root, 'cXML');
  if (!isRecord(cxml)) throw new Error('Not a cXML document: missing <cXML> root.');

  const orderRequest = get(get(cxml, 'Request'), 'OrderRequest');
  const header = get(orderRequest, 'OrderRequestHeader');
  if (!isRecord(header)) throw new Error('Invalid cXML OrderRequest: missing OrderRequestHeader.');

  const orderId = attr(header, 'orderID');
  if (!orderId) throw new Error('Invalid cXML OrderRequest: missing orderID.');

  const items = toArray(get(orderRequest, 'ItemOut'));
  const lines = items.map(parseLine).sort((a, b) => a.lineNumber - b.lineNumber);

  // Ship-to: prefer the header, fall back to the first line's ShipTo.
  const headerShipTo = get(get(header, 'ShipTo'), 'Address');
  const lineShipTo = get(get(items[0], 'ShipTo'), 'Address');
  const shipTo = parseShipTo(headerShipTo ?? lineShipTo);

  const orderExtrinsics = toArray(get(header, 'Extrinsic'));
  const money = get(get(header, 'Total'), 'Money');

  // SharedSecret lives on a Sender credential in the Header.
  let sharedSecret: string | null = null;
  for (const cred of toArray(get(get(cxml, 'Header'), 'Sender'))) {
    for (const c of toArray(get(cred, 'Credential'))) {
      const secret = textOf(get(c, 'SharedSecret'));
      if (secret) sharedSecret = secret;
    }
  }

  return {
    orderId,
    orderType: textOf(findExtrinsic(orderExtrinsics, 'OrderType')),
    orderDate: attr(header, 'orderDate'),
    payloadId: attr(cxml, 'payloadID'),
    total: textOf(money),
    currency: attr(money, 'currency'),
    sharedSecret,
    shipToCompany: shipTo.company,
    shipToName: shipTo.name,
    shipToCity: shipTo.city,
    shipToState: shipTo.state,
    lines,
  };
}
