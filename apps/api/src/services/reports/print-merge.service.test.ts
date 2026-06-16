import Papa from 'papaparse';
import {
  buildPrintMergeRows,
  convertFour51OrdersToPrintMerge,
  extractTrailingDate,
  isPersonalized,
  splitImprint,
  type StoredPrintOrder,
} from './print-merge.service.js';

describe('splitImprint', () => {
  it('splits org - location and peels a trailing date', () => {
    const r = splitImprint('White Chapel Memorial Gardens - Wichita October 26');
    expect(r.titleLine1).toBe('White Chapel Memorial Gardens');
    expect(r.titleLine2).toBe('Wichita');
    expect(r.eventDate).toBe('October 26');
  });

  it('keeps an org name intact when there is no separator, peeling the date', () => {
    const r = splitImprint('Grand Lawn Cemetery & Mausoleum November 13');
    expect(r.titleLine1).toBe('Grand Lawn Cemetery & Mausoleum');
    expect(r.titleLine2).toBe('');
    expect(r.eventDate).toBe('November 13');
  });

  it('handles a plain org with no date', () => {
    const r = splitImprint('Bronswood Cemetery');
    expect(r).toEqual({ titleLine1: 'Bronswood Cemetery', titleLine2: '', eventDate: '' });
  });
});

describe('extractTrailingDate', () => {
  it('extracts an abbreviated month with a year', () => {
    const { remainder, date } = extractTrailingDate('Covington Memorial Gardens Dec 14, 2024');
    expect(remainder).toBe('Covington Memorial Gardens');
    expect(date).toBe('Dec 14, 2024');
  });
});

describe('isPersonalized', () => {
  it('treats a repeated SKU or empty value as not personalized', () => {
    expect(isPersonalized('EVR-BAG-001', 'EVR-BAG-001')).toBe(false);
    expect(isPersonalized('', 'EVR-BAG-001')).toBe(false);
    expect(isPersonalized('Sunset Memorial Park', 'EVR-CRD-002')).toBe(true);
  });
});

describe('convertFour51OrdersToPrintMerge', () => {
  it('preserves column alignment for a comma-bearing, quoted imprint (the core bug)', () => {
    const input = Papa.unparse([
      {
        'Order ID': '1001',
        'Product ID': 'EVR-CRD-9',
        'Product Name': 'Memorial Card',
        'Customized Product ID': 'Smith Family, In Memory - Ohio May 3',
        'Total Quantity': '5',
        'Quantity Multiplier': '1',
        'Date Submitted': '5/3/24',
        'Ship To Company Name': 'Smith Funeral Home',
        'Ship To First Name': 'Jane',
        'Ship To Last Name': 'Doe',
        'Ship To City': 'Columbus',
        'Ship To State': 'OH',
      },
    ]);

    const { csv, stats } = convertFour51OrdersToPrintMerge(input);
    expect(stats.rowsIn).toBe(1);
    expect(stats.rowsOut).toBe(1);
    expect(stats.personalized).toBe(1);

    const out = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const rec = out.data[0];
    expect(rec.ProductID).toBe('EVR-CRD-9');
    expect(rec.CustomizedText).toBe('Smith Family, In Memory - Ohio May 3');
    expect(rec.TitleLine1).toBe('Smith Family, In Memory');
    expect(rec.TitleLine2).toBe('Ohio');
    expect(rec.EventDate).toBe('May 3');
    expect(rec.ShipToName).toBe('Jane Doe');
  });

  it('numbers lines sequentially within each order', () => {
    const input = Papa.unparse([
      { 'Order ID': 'A', 'Product ID': 'P1', 'Customized Product ID': 'Org One' },
      { 'Order ID': 'A', 'Product ID': 'P2', 'Customized Product ID': 'Org Two' },
      { 'Order ID': 'B', 'Product ID': 'P1', 'Customized Product ID': 'Org Three' },
    ]);
    const { csv } = convertFour51OrdersToPrintMerge(input);
    const out = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(out.data.map((r) => r.LineNumber)).toEqual(['1', '2', '1']);
  });

  it('expands rows by quantity when requested', () => {
    const input = Papa.unparse([
      { 'Order ID': 'A', 'Product ID': 'P9', 'Customized Product ID': 'Memorial Bench', 'Total Quantity': '3' },
    ]);
    const { stats } = convertFour51OrdersToPrintMerge(input, { expandQuantity: true });
    expect(stats.rowsOut).toBe(3);
  });

  it('throws on a non-Four51 file', () => {
    const input = Papa.unparse([{ foo: 'bar', baz: 'qux' }]);
    expect(() => convertFour51OrdersToPrintMerge(input)).toThrow(/Four51/);
  });
});

describe('buildPrintMergeRows (stored orders)', () => {
  it('maps stored print orders into rows with separated title lines', () => {
    const orders: StoredPrintOrder[] = [
      {
        four51OrderId: '1320',
        orderDate: new Date('2024-03-30T00:00:00Z'),
        shipToCompany: 'Everstory Partners',
        shipToName: 'Attn: Jane Smith',
        shipToCity: 'Muncie',
        shipToState: 'IN',
        lines: [
          {
            lineNumber: 1,
            productId: 'BC-6',
            description: 'Business Card',
            quantity: 10,
            quantityMultiplier: 250,
            titleLine1: 'Jane Smith',
            titleLine2: 'Director of Operations',
            specs: { CustomerName: 'Test Name' },
          },
          {
            lineNumber: 2,
            productId: 'J-32321',
            description: 'USA Jacket',
            quantity: 2,
            quantityMultiplier: 100,
            titleLine1: null,
            titleLine2: null,
            specs: {},
          },
        ],
      },
    ];
    const rows = buildPrintMergeRows(orders);
    expect(rows).toHaveLength(2);
    expect(rows[0].OrderID).toBe('1320');
    expect(rows[0].TitleLine1).toBe('Jane Smith');
    expect(rows[0].TitleLine2).toBe('Director of Operations');
    expect(rows[0].IsPersonalized).toBe('Yes');
    expect(rows[0].ShipToCompany).toBe('Everstory Partners');
    expect(rows[0].DateSubmitted).toBe('2024-03-30');
    expect(rows[1].IsPersonalized).toBe('No');
    expect(rows[1].TitleLine1).toBe('');
  });
});
