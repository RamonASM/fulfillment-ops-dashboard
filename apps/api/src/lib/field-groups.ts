/**
 * Field Groups and Blocking Rules for Intelligent Column Mapping
 *
 * This module provides semantic understanding of field relationships,
 * blocking rules to prevent bad mappings, and co-occurrence boosting.
 */

// =============================================================================
// SEMANTIC FIELD GROUPS
// =============================================================================

/**
 * Fields that are semantically related and often appear together.
 * Used for co-occurrence boosting and conflict detection.
 */
export const FIELD_GROUPS = {
  // Shipping address components - should never be confused with each other
  SHIPPING_ADDRESS: [
    'shipToCompany',
    'shipToStreet1',
    'shipToStreet2',
    'shipToCity',
    'shipToState',
    'shipToZip',
    'shipToCountry',
    'shipToLocation',
    'shipToIdentifier',
  ],

  // Contact information
  CONTACT: [
    'shipToPhone',
    'shipToEmail',
    'contactName',
    'orderedBy',
  ],

  // Financial/Pricing fields
  FINANCIAL: [
    'unitPrice',
    'extendedPrice',
    'discount',
    'taxAmount',
    'totalPrice',
    'unitCost',
    'listPrice',
    'totalValue',
    'currency',
  ],

  // Order identifiers and details
  ORDER_DETAILS: [
    'orderId',
    'dateSubmitted',
    'orderStatus',
    'lineNumber',
    'lineItemId',
  ],

  // Quantity fields
  QUANTITIES: [
    'quantityUnits',
    'quantityPacks',
    'currentStockPacks',
    'packSize',
  ],

  // Shipping/Logistics
  SHIPPING_LOGISTICS: [
    'shipMethod',
    'trackingNumber',
    'shipDate',
    'expectedDeliveryDate',
    'shipWeight',
  ],

  // Product identification
  PRODUCT_IDENTITY: [
    'productId',
    'name',
    'productName',
  ],
} as const;

// =============================================================================
// BLOCKING RULES
// =============================================================================

/**
 * Blocking rules prevent specific header patterns from mapping to certain fields.
 * This prevents common mistakes like "Ship To City" mapping to "shipToCompany".
 */
export interface BlockingRule {
  /** Patterns in the header that trigger this rule */
  headerPatterns: string[];
  /** Fields that should NEVER be matched when this rule triggers */
  blockedFields: string[];
  /** Description for debugging/logging */
  reason: string;
}

export const BLOCKING_RULES: BlockingRule[] = [
  // Address component blocking - never map street/city/state/zip to company
  {
    headerPatterns: ['street', 'address 1', 'address line', 'addr 1', 'str '],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToCity', 'shipToState', 'shipToZip'],
    reason: 'Street address should not map to company, city, state, or zip',
  },
  {
    headerPatterns: ['city', 'town', 'municipality'],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToStreet1', 'shipToState', 'shipToZip'],
    reason: 'City should not map to company, street, state, or zip',
  },
  {
    headerPatterns: ['state', 'province', 'region'],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToStreet1', 'shipToCity', 'shipToZip'],
    reason: 'State/province should not map to company, street, city, or zip',
  },
  {
    headerPatterns: ['zip', 'postal', 'postcode'],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToStreet1', 'shipToCity', 'shipToState'],
    reason: 'Zip/postal code should not map to company, street, city, or state',
  },
  {
    headerPatterns: ['country', 'nation'],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToStreet1', 'shipToCity', 'shipToState', 'shipToZip'],
    reason: 'Country should not map to other address components',
  },

  // User/Contact blocking - never map user fields to shipping
  {
    headerPatterns: ['user', 'ordered by', 'submitted by', 'requester', 'created by'],
    blockedFields: ['shipToCompany', 'shipToLocation', 'shipToStreet1', 'shipToCity', 'contactName'],
    reason: 'User/requester should not map to shipping address fields',
  },

  // Financial blocking - never skip price fields
  {
    headerPatterns: ['unit price', 'price each', 'price per'],
    blockedFields: ['productName', 'name', 'orderId', 'quantityUnits'],
    reason: 'Unit price should map to price field, not product/order fields',
  },
  {
    headerPatterns: ['extended price', 'ext price', 'line total', 'line amount'],
    blockedFields: ['productName', 'name', 'orderId', 'quantityUnits', 'unitPrice'],
    reason: 'Extended price should not map to unit price or non-financial fields',
  },
  {
    headerPatterns: ['discount', 'disc amt'],
    blockedFields: ['productName', 'name', 'orderId', 'quantityUnits'],
    reason: 'Discount should map to financial field',
  },
  {
    headerPatterns: ['tax', 'vat', 'sales tax', 'gst'],
    blockedFields: ['productName', 'name', 'orderId', 'quantityUnits'],
    reason: 'Tax should map to financial field',
  },

  // Quantity blocking - don't confuse packs with units
  {
    headerPatterns: ['packs', 'cases', 'cartons', 'boxes'],
    blockedFields: ['quantityUnits'],
    reason: 'Pack quantities should not map to unit quantities',
  },
];

/**
 * Check if a header should be blocked from mapping to a specific field.
 * Returns the blocking rule if blocked, null otherwise.
 */
export function checkBlockingRule(
  header: string,
  targetField: string
): BlockingRule | null {
  const normalizedHeader = header.toLowerCase().trim();

  for (const rule of BLOCKING_RULES) {
    // Check if any header pattern matches
    const headerMatches = rule.headerPatterns.some(pattern =>
      normalizedHeader.includes(pattern.toLowerCase())
    );

    if (headerMatches && rule.blockedFields.includes(targetField)) {
      return rule;
    }
  }

  return null;
}

// =============================================================================
// CO-OCCURRENCE BOOSTING
// =============================================================================

/**
 * When certain fields are detected in a file, boost the scores for related fields.
 * This helps when files have consistent naming patterns.
 */
export interface CoOccurrenceBoost {
  /** If any of these fields are matched with high confidence */
  triggerFields: string[];
  /** Boost scores for these related fields */
  boostFields: string[];
  /** Amount to add to confidence score (0-0.3) */
  boostAmount: number;
}

export const CO_OCCURRENCE_BOOSTS: CoOccurrenceBoost[] = [
  // If we found ship to city, boost other address fields
  {
    triggerFields: ['shipToCity'],
    boostFields: ['shipToState', 'shipToZip', 'shipToStreet1', 'shipToCountry'],
    boostAmount: 0.15,
  },
  {
    triggerFields: ['shipToState'],
    boostFields: ['shipToCity', 'shipToZip', 'shipToStreet1', 'shipToCountry'],
    boostAmount: 0.15,
  },
  {
    triggerFields: ['shipToZip'],
    boostFields: ['shipToCity', 'shipToState', 'shipToStreet1', 'shipToCountry'],
    boostAmount: 0.15,
  },

  // If we found order ID, boost order-related fields
  {
    triggerFields: ['orderId'],
    boostFields: ['dateSubmitted', 'orderStatus', 'lineNumber', 'quantityUnits'],
    boostAmount: 0.1,
  },

  // If we found unit price, boost other financial fields
  {
    triggerFields: ['unitPrice'],
    boostFields: ['extendedPrice', 'discount', 'taxAmount', 'totalPrice'],
    boostAmount: 0.15,
  },
  {
    triggerFields: ['extendedPrice'],
    boostFields: ['unitPrice', 'discount', 'taxAmount', 'totalPrice'],
    boostAmount: 0.15,
  },
];

/**
 * Calculate boost amount for a field based on already-matched fields.
 */
export function calculateCoOccurrenceBoost(
  targetField: string,
  matchedFields: Set<string>
): number {
  let totalBoost = 0;

  for (const boost of CO_OCCURRENCE_BOOSTS) {
    // Check if any trigger field has been matched
    const triggered = boost.triggerFields.some(f => matchedFields.has(f));

    if (triggered && boost.boostFields.includes(targetField)) {
      totalBoost += boost.boostAmount;
    }
  }

  // Cap the total boost
  return Math.min(0.3, totalBoost);
}

// =============================================================================
// MINIMUM CONFIDENCE THRESHOLDS
// =============================================================================

/**
 * Different field types have different minimum confidence thresholds.
 * Fields that are often confused need higher thresholds.
 */
export const MINIMUM_CONFIDENCE_THRESHOLDS: Record<string, number> = {
  // Core fields - standard threshold
  productId: 0.50,
  name: 0.50,
  productName: 0.50,
  orderId: 0.50,
  dateSubmitted: 0.50,
  quantityUnits: 0.50,

  // Address fields - higher threshold to prevent confusion
  shipToCompany: 0.65,
  shipToStreet1: 0.60,
  shipToStreet2: 0.60,
  shipToCity: 0.60,
  shipToState: 0.60,
  shipToZip: 0.60,
  shipToCountry: 0.60,
  shipToLocation: 0.60,

  // Financial fields - higher threshold for accuracy
  unitPrice: 0.60,
  extendedPrice: 0.60,
  discount: 0.55,
  taxAmount: 0.55,
  totalPrice: 0.55,

  // User/Contact fields - medium threshold
  orderedBy: 0.55,
  contactName: 0.55,
  customerId: 0.55,

  // Default for unlisted fields
  default: 0.50,
};

/**
 * Get the minimum confidence threshold for a field.
 */
export function getMinimumConfidence(field: string): number {
  return MINIMUM_CONFIDENCE_THRESHOLDS[field] || MINIMUM_CONFIDENCE_THRESHOLDS.default;
}

// =============================================================================
// ALTERNATIVE SUGGESTIONS
// =============================================================================

/**
 * When a field is blocked or confidence is low, suggest alternatives.
 */
export function suggestAlternatives(
  header: string,
  blockedField: string
): string[] {
  const normalizedHeader = header.toLowerCase().trim();

  // Based on header content, suggest likely alternatives
  if (normalizedHeader.includes('street') || normalizedHeader.includes('address 1')) {
    return ['shipToStreet1', 'shipToLocation'];
  }
  if (normalizedHeader.includes('city') || normalizedHeader.includes('town')) {
    return ['shipToCity'];
  }
  if (normalizedHeader.includes('state') || normalizedHeader.includes('province')) {
    return ['shipToState'];
  }
  if (normalizedHeader.includes('zip') || normalizedHeader.includes('postal')) {
    return ['shipToZip'];
  }
  if (normalizedHeader.includes('user') || normalizedHeader.includes('requester')) {
    return ['orderedBy', 'contactName'];
  }
  if (normalizedHeader.includes('price') && !normalizedHeader.includes('ext')) {
    return ['unitPrice', 'listPrice'];
  }
  if (normalizedHeader.includes('ext') || normalizedHeader.includes('total')) {
    return ['extendedPrice', 'totalPrice'];
  }

  return [];
}

// =============================================================================
// FIELD DISPLAY NAMES (for UI)
// =============================================================================

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  // Product fields
  productId: 'Product ID / SKU',
  name: 'Product Name',
  productName: 'Product Name',

  // Inventory fields
  currentStockPacks: 'Available Quantity (Packs)',
  packSize: 'Pack Size',
  notificationPoint: 'Reorder Point',
  itemType: 'Item Type',

  // Order fields
  orderId: 'Order ID',
  dateSubmitted: 'Order Date',
  quantityUnits: 'Quantity (Units)',
  quantityPacks: 'Quantity (Packs)',
  orderStatus: 'Order Status',

  // Shipping address
  shipToCompany: 'Ship To Company',
  shipToStreet1: 'Ship To Street',
  shipToStreet2: 'Ship To Street 2',
  shipToCity: 'Ship To City',
  shipToState: 'Ship To State',
  shipToZip: 'Ship To Zip',
  shipToCountry: 'Ship To Country',
  shipToLocation: 'Ship To Location',
  shipToIdentifier: 'Location ID',

  // Contact
  shipToPhone: 'Phone',
  shipToEmail: 'Email',
  contactName: 'Contact Name',
  orderedBy: 'Ordered By',
  customerId: 'Customer ID',

  // Financial
  unitPrice: 'Unit Price',
  extendedPrice: 'Extended Price',
  discount: 'Discount',
  taxAmount: 'Tax Amount',
  totalPrice: 'Total Price',
  unitCost: 'Unit Cost',
  listPrice: 'List Price',
  totalValue: 'Total Value',
  currency: 'Currency',

  // Shipping logistics
  shipMethod: 'Ship Method',
  trackingNumber: 'Tracking Number',
  shipDate: 'Ship Date',
  expectedDeliveryDate: 'Expected Delivery',
  shipWeight: 'Weight',

  // Order details
  lineNumber: 'Line Number',
  lineItemId: 'Line Item ID',
};

/**
 * Get display name for a field (for UI).
 */
export function getFieldDisplayName(field: string): string {
  return FIELD_DISPLAY_NAMES[field] || field.replace(/([A-Z])/g, ' $1').trim();
}
