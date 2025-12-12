/**
 * Field Groups and Blocking Rules for Intelligent Column Mapping
 *
 * This module provides semantic understanding of field relationships,
 * blocking rules to prevent bad mappings, and co-occurrence boosting.
 */

// =============================================================================
// SEMANTIC CATEGORIES WITH INCOMPATIBILITY RULES
// =============================================================================

/**
 * Semantic categories define field types and which categories are incompatible.
 * This prevents semantic mismatches like "Order Type" → "Total Price".
 */
export const SEMANTIC_CATEGORIES = {
  // Order metadata - categorical/descriptive properties of orders
  ORDER_METADATA: {
    fields: ['orderType', 'orderStatus', 'lineNumber', 'lineItemId', 'orderPriority', 'orderSource'],
    incompatibleWith: ['FINANCIAL', 'ADDRESS', 'QUANTITIES'],
    expectedDataTypes: ['categorical', 'text', 'alphanumeric'],
  },

  // Financial - monetary values
  FINANCIAL: {
    fields: ['unitPrice', 'extendedPrice', 'totalPrice', 'discount', 'taxAmount', 'unitCost', 'listPrice', 'totalValue', 'currency'],
    incompatibleWith: ['ORDER_METADATA', 'ADDRESS', 'CONTACT', 'PERSON_NAME'],
    expectedDataTypes: ['numeric_positive', 'numeric'],
  },

  // Address components
  ADDRESS: {
    fields: ['shipToCompany', 'shipToStreet1', 'shipToStreet2', 'shipToCity', 'shipToState', 'shipToZip', 'shipToCountry', 'shipToLocation', 'shipToIdentifier'],
    incompatibleWith: ['FINANCIAL', 'QUANTITIES', 'PERSON_NAME'],
    expectedDataTypes: ['text', 'alphanumeric'],
  },

  // Person name fields
  PERSON_NAME: {
    fields: ['shipToFirstName', 'shipToLastName', 'contactFirstName', 'contactLastName', 'fullName'],
    incompatibleWith: ['FINANCIAL', 'ADDRESS', 'QUANTITIES'],
    expectedDataTypes: ['text'],
  },

  // Contact information (non-name)
  CONTACT: {
    fields: ['shipToPhone', 'shipToEmail', 'contactPhone', 'contactEmail', 'orderedBy', 'contactName', 'customerId'],
    incompatibleWith: ['FINANCIAL', 'QUANTITIES'],
    expectedDataTypes: ['text', 'alphanumeric'],
  },

  // Quantity fields
  QUANTITIES: {
    fields: ['quantityUnits', 'quantityPacks', 'currentStockPacks', 'packSize', 'quantityMultiplier', 'totalQuantity'],
    incompatibleWith: ['ADDRESS', 'ORDER_METADATA', 'PERSON_NAME', 'CONTACT'],
    expectedDataTypes: ['numeric_positive', 'numeric_integer'],
  },

  // Product identification
  PRODUCT_IDENTITY: {
    fields: ['productId', 'name', 'productName', 'sku', 'customizedProductId'],
    incompatibleWith: [],
    expectedDataTypes: ['text', 'alphanumeric'],
  },
} as const;

export type SemanticCategory = keyof typeof SEMANTIC_CATEGORIES;

/**
 * Find the semantic category for a field.
 */
export function getFieldCategory(field: string): SemanticCategory | null {
  for (const [category, config] of Object.entries(SEMANTIC_CATEGORIES)) {
    if ((config.fields as readonly string[]).includes(field)) {
      return category as SemanticCategory;
    }
  }
  return null;
}

/**
 * Check if a header is semantically compatible with a target field.
 * Returns compatibility info with reason if incompatible.
 */
export function checkSemanticCompatibility(
  header: string,
  targetField: string,
  detectedDataType?: string
): { compatible: boolean; reason?: string; suggestedCategory?: SemanticCategory } {
  const normalizedHeader = header.toLowerCase().trim();
  const targetCategory = getFieldCategory(targetField);

  if (!targetCategory) {
    return { compatible: true };
  }

  const targetConfig = SEMANTIC_CATEGORIES[targetCategory];

  // Check if header suggests a different semantic category
  const headerCategory = inferCategoryFromHeader(normalizedHeader);

  if (headerCategory && (targetConfig.incompatibleWith as readonly string[]).includes(headerCategory)) {
    return {
      compatible: false,
      reason: `"${header}" appears to be ${headerCategory} but "${targetField}" is ${targetCategory}`,
      suggestedCategory: headerCategory,
    };
  }

  // Check data type compatibility if provided
  if (detectedDataType && !(targetConfig.expectedDataTypes as readonly string[]).includes(detectedDataType)) {
    return {
      compatible: false,
      reason: `Data type "${detectedDataType}" doesn't match expected types for ${targetCategory}`,
    };
  }

  return { compatible: true };
}

/**
 * Infer the semantic category from header text.
 */
function inferCategoryFromHeader(header: string): SemanticCategory | null {
  const h = header.toLowerCase();

  // Order metadata indicators
  if (h.includes('order type') || h.includes('type') && !h.includes('item type')) {
    if (h.includes('price') || h.includes('cost') || h.includes('amount')) {
      return 'FINANCIAL';
    }
    return 'ORDER_METADATA';
  }
  if (h.includes('priority') || h.includes('source') || h.includes('channel')) {
    return 'ORDER_METADATA';
  }

  // Person name indicators
  if (h.includes('first name') || h.includes('firstname') || h.includes('fname') ||
      h.includes('last name') || h.includes('lastname') || h.includes('lname') ||
      h.includes('full name') || h.includes('given name') || h.includes('surname')) {
    return 'PERSON_NAME';
  }

  // Financial indicators
  if (h.includes('price') || h.includes('cost') || h.includes('amount') ||
      h.includes('total') && (h.includes('$') || h.includes('price') || h.includes('cost')) ||
      h.includes('discount') || h.includes('tax')) {
    return 'FINANCIAL';
  }

  // Address indicators
  if (h.includes('street') || h.includes('city') || h.includes('state') ||
      h.includes('zip') || h.includes('postal') || h.includes('country') ||
      h.includes('address')) {
    return 'ADDRESS';
  }

  // Quantity indicators
  if (h.includes('quantity') || h.includes('qty') || h.includes('count') ||
      h.includes('multiplier') || h.includes('pack size') || h.includes('units')) {
    return 'QUANTITIES';
  }

  // Contact indicators
  if (h.includes('phone') || h.includes('email') || h.includes('contact') ||
      h.includes('ordered by') || h.includes('requester')) {
    return 'CONTACT';
  }

  return null;
}

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

  // =============================================================================
  // NEW BLOCKING RULES - Fix semantic mismatches from screenshot
  // =============================================================================

  // ORDER TYPE should NEVER map to financial fields
  {
    headerPatterns: ['order type', 'type', 'item type', 'product type', 'category type'],
    blockedFields: ['totalPrice', 'unitPrice', 'extendedPrice', 'discount', 'taxAmount', 'unitCost', 'listPrice', 'totalValue'],
    reason: 'Type/category fields are ORDER_METADATA, not FINANCIAL - "Order Type" should never map to price fields',
  },

  // COMPANY NAME should NOT map to country/state/city
  {
    headerPatterns: ['company name', 'company', 'organization', 'business name', 'firm'],
    blockedFields: ['shipToCountry', 'shipToState', 'shipToCity', 'shipToZip', 'shipToStreet1'],
    reason: 'Company name is entity name, not geographic location - should map to shipToCompany',
  },

  // FIRST NAME / LAST NAME should NOT map to address components
  {
    headerPatterns: ['first name', 'firstname', 'fname', 'given name', 'forename'],
    blockedFields: ['shipToState', 'shipToCity', 'shipToCountry', 'shipToZip', 'shipToStreet1', 'shipToCompany'],
    reason: 'First name is PERSON_NAME, not ADDRESS - should map to shipToFirstName or contactFirstName',
  },
  {
    headerPatterns: ['last name', 'lastname', 'lname', 'surname', 'family name'],
    blockedFields: ['shipToState', 'shipToCity', 'shipToCountry', 'shipToZip', 'shipToStreet1', 'shipToCompany'],
    reason: 'Last name is PERSON_NAME, not ADDRESS - should map to shipToLastName or contactLastName',
  },
  {
    headerPatterns: ['full name', 'name', 'recipient name', 'attention'],
    blockedFields: ['shipToState', 'shipToCity', 'shipToCountry', 'shipToZip'],
    reason: 'Person name should not map to address components',
  },

  // PHONE should NOT map to street/address/non-contact fields or date/numeric fields
  {
    headerPatterns: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'fax', 'ship to phone'],
    blockedFields: [
      'shipToStreet1', 'shipToStreet2', 'shipToCity', 'shipToState', 'shipToCountry', 'shipToZip', 'shipToCompany',
      'leadTimeDays', 'shipWeight', 'expectedDeliveryDate', 'shipDate', 'dateSubmitted',
      'quantityUnits', 'quantityPacks', 'totalQuantity', 'packSize',
    ],
    reason: 'Phone is CONTACT information - should map to shipToPhone or contactPhone, not dates/quantities',
  },

  // EMAIL should NOT map to address fields
  {
    headerPatterns: ['email', 'e-mail', 'mail'],
    blockedFields: ['shipToStreet1', 'shipToStreet2', 'shipToCity', 'shipToState', 'shipToCountry', 'shipToZip', 'shipToCompany'],
    reason: 'Email is CONTACT information, not ADDRESS - should map to shipToEmail or contactEmail',
  },

  // MULTIPLIER should NOT map to quantity fields directly
  {
    headerPatterns: ['multiplier', 'quantity multiplier', 'factor', 'pack qty', 'per pack', 'per case'],
    blockedFields: ['quantityUnits', 'currentStockPacks', 'quantityPacks'],
    reason: 'Multiplier is pack conversion factor, not quantity - should map to packSize',
  },

  // TOTAL QUANTITY should map to totalQuantity, not quantityUnits
  {
    headerPatterns: ['total quantity', 'total qty', 'total units', 'sum qty', 'total count'],
    blockedFields: ['quantityPacks', 'packSize', 'currentStockPacks'],
    reason: 'Total quantity is aggregate units, should map to totalQuantity or quantityUnits',
  },

  // CUSTOMIZED PRODUCT ID should NOT map to address fields
  {
    headerPatterns: ['customized product', 'custom product', 'customized id', 'custom id', 'personalized'],
    blockedFields: ['shipToStreet1', 'shipToStreet2', 'shipToCity', 'shipToState', 'shipToCountry', 'shipToZip', 'shipToCompany'],
    reason: 'Customized product ID is PRODUCT_IDENTITY, not ADDRESS',
  },

  // =============================================================================
  // ADDITIONAL BLOCKING RULES - Fix remaining fuzzy match issues
  // =============================================================================

  // EXTENDED PRICE should NOT map to dates
  {
    headerPatterns: ['extended price', 'ext price', 'extended', 'extended amount'],
    blockedFields: ['expectedDeliveryDate', 'shipDate', 'dateSubmitted', 'leadTimeDays', 'shipWeight', 'quantityUnits', 'quantityPacks'],
    reason: 'Extended price is FINANCIAL - should map to extendedPrice, not dates/quantities',
  },

  // TOTAL PRICE should NOT map to quantities or other price fields
  {
    headerPatterns: ['total price', 'total cost', 'total amount', 'grand total', 'invoice total'],
    blockedFields: ['quantityUnits', 'quantityPacks', 'totalQuantity', 'packSize', 'shipWeight', 'leadTimeDays', 'unitPrice', 'extendedPrice', 'listPrice', 'unitCost', 'discount'],
    reason: 'Total price is FINANCIAL aggregate - should map to totalPrice only',
  },

  // TOTAL QUANTITY should NOT map to weight or dates
  {
    headerPatterns: ['total quantity', 'total qty', 'total units', 'sum quantity', 'aggregate quantity'],
    blockedFields: ['shipWeight', 'leadTimeDays', 'expectedDeliveryDate', 'shipDate', 'totalPrice', 'unitPrice', 'extendedPrice'],
    reason: 'Total quantity is QUANTITIES - should map to totalQuantity, not weight/dates/prices',
  },

  // QUANTITY MULTIPLIER should NOT map to minimumOrderQuantity
  {
    headerPatterns: ['quantity multiplier', 'multiplier', 'pack multiplier', 'qty multiplier', 'factor'],
    blockedFields: ['minimumOrderQuantity', 'quantityUnits', 'leadTimeDays', 'shipWeight'],
    reason: 'Quantity multiplier is pack conversion - should map to quantityMultiplier or packSize',
  },

  // SHIP TO STREET should NOT map to dates or numeric fields
  {
    headerPatterns: ['ship to street', 'street', 'street address', 'address line', 'address 1'],
    blockedFields: ['leadTimeDays', 'shipWeight', 'expectedDeliveryDate', 'shipDate', 'quantityUnits', 'totalPrice'],
    reason: 'Ship to street is ADDRESS - should map to shipToStreet1',
  },

  // WEIGHT should NOT map to address or contact fields
  {
    headerPatterns: ['weight', 'ship weight', 'package weight', 'gross weight'],
    blockedFields: ['shipToStreet1', 'shipToCity', 'shipToState', 'shipToPhone', 'totalQuantity', 'quantityUnits'],
    reason: 'Weight is LOGISTICS - should map to shipWeight',
  },

  // LEAD TIME should NOT map to contact or address fields
  {
    headerPatterns: ['lead time', 'lead days', 'leadtime'],
    blockedFields: ['shipToPhone', 'shipToStreet1', 'shipToCity', 'quantityUnits', 'totalQuantity'],
    reason: 'Lead time is VENDOR info - should map to leadTimeDays',
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
  if (normalizedHeader.includes('country')) {
    return ['shipToCountry'];
  }
  if (normalizedHeader.includes('user') || normalizedHeader.includes('requester')) {
    return ['orderedBy', 'contactName'];
  }
  if (normalizedHeader.includes('price') && !normalizedHeader.includes('ext')) {
    return ['unitPrice', 'listPrice'];
  }
  if (normalizedHeader.includes('ext') || (normalizedHeader.includes('total') && normalizedHeader.includes('price'))) {
    return ['extendedPrice', 'totalPrice'];
  }

  // New field suggestions for semantic fixes
  if (normalizedHeader.includes('order type') || normalizedHeader.includes('type')) {
    return ['orderType', 'itemType'];
  }
  if (normalizedHeader.includes('first name') || normalizedHeader.includes('firstname')) {
    return ['shipToFirstName', 'contactFirstName'];
  }
  if (normalizedHeader.includes('last name') || normalizedHeader.includes('lastname')) {
    return ['shipToLastName', 'contactLastName'];
  }
  if (normalizedHeader.includes('company name') || normalizedHeader.includes('company')) {
    return ['shipToCompany'];
  }
  if (normalizedHeader.includes('phone') || normalizedHeader.includes('telephone') || normalizedHeader.includes('tel')) {
    return ['shipToPhone', 'contactPhone'];
  }
  if (normalizedHeader.includes('email')) {
    return ['shipToEmail', 'contactEmail'];
  }
  if (normalizedHeader.includes('multiplier') || normalizedHeader.includes('pack size') || normalizedHeader.includes('per pack')) {
    return ['packSize', 'quantityMultiplier'];
  }
  if (normalizedHeader.includes('total quantity') || normalizedHeader.includes('total qty')) {
    return ['totalQuantity', 'quantityUnits'];
  }
  if (normalizedHeader.includes('customized') || normalizedHeader.includes('custom product')) {
    return ['customizedProductId', 'sku'];
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
  sku: 'SKU',
  customizedProductId: 'Customized Product ID',

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
  orderType: 'Order Type',
  orderPriority: 'Order Priority',
  orderSource: 'Order Source',
  totalQuantity: 'Total Quantity',
  quantityMultiplier: 'Quantity Multiplier',

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

  // Person name fields
  shipToFirstName: 'Ship To First Name',
  shipToLastName: 'Ship To Last Name',
  contactFirstName: 'Contact First Name',
  contactLastName: 'Contact Last Name',
  fullName: 'Full Name',

  // Contact
  shipToPhone: 'Phone',
  shipToEmail: 'Email',
  contactName: 'Contact Name',
  contactPhone: 'Contact Phone',
  contactEmail: 'Contact Email',
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
