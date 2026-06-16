import { parseFour51Cxml } from './four51-cxml.service.js';

const SAMPLE = `<?xml version="1.0"?>
<cXML version="1.2.005" payloadID="abc123@Four51.com" timestamp="2024-09-30T16:19:25">
  <Header>
    <From><Credential domain="DUNS"><Identity>123456789</Identity></Credential></From>
    <To><Credential domain="Admin"><Identity>Everstory</Identity></Credential></To>
    <Sender>
      <Credential domain="DUNS"><Identity>134470637</Identity><SharedSecret>s3cr3t!</SharedSecret></Credential>
      <UserAgent>WildFire</UserAgent>
    </Sender>
  </Header>
  <Request deploymentMode="production">
    <OrderRequest>
      <OrderRequestHeader orderID="1320" orderDate="2024-03-30T16:19:25" type="new">
        <Total><Money currency="USD">81.10</Money></Total>
        <ShipTo>
          <Address addressID="x1">
            <Name xml:lang="en-US">Ship Addr</Name>
            <PostalAddress name="Everstory Partners">
              <DeliverTo>Attn: Jane Smith</DeliverTo>
              <Street>1 Main St</Street><City>Muncie</City><State>IN</State>
              <PostalCode>47303</PostalCode><Country isoCountryCode="US">United States</Country>
            </PostalAddress>
          </Address>
        </ShipTo>
        <Extrinsic name="OrderType">Standard</Extrinsic>
      </OrderRequestHeader>

      <ItemOut lineNumber="2" quantity="2">
        <ItemID><SupplierPartID>J-32321</SupplierPartID><SupplierPartAuxiliaryID>J-32321</SupplierPartAuxiliaryID></ItemID>
        <ItemDetail>
          <UnitPrice><Money currency="USD">15.00</Money></UnitPrice>
          <Description xml:lang="en-US">USA Jacket</Description>
          <UnitOfMeasure>EA</UnitOfMeasure>
          <Extrinsic name="productType">Static</Extrinsic>
          <Extrinsic name="quantityMultiplier">100</Extrinsic>
        </ItemDetail>
      </ItemOut>

      <ItemOut lineNumber="1" quantity="10">
        <ItemID><SupplierPartID>BC-6</SupplierPartID><SupplierPartAuxiliaryID>BC-6-V1</SupplierPartAuxiliaryID></ItemID>
        <ItemDetail>
          <UnitPrice><Money currency="USD">4.00</Money></UnitPrice>
          <Description xml:lang="en-US">Business Card</Description>
          <UnitOfMeasure>EA</UnitOfMeasure>
          <URL>http://www.four51.com/ui/variableimage/PDF/li-k43jo4i.pdf</URL>
          <Extrinsic name="productType">VariableText</Extrinsic>
          <Extrinsic name="quantityMultiplier">250</Extrinsic>
          <Extrinsic name="ProductSpecs">
            <Extrinsic name="Title Line 1">Jane Smith</Extrinsic>
            <Extrinsic name="Title Line 2">Director of Operations</Extrinsic>
            <Extrinsic name="CustomerName">Test Name</Extrinsic>
            <Extrinsic name="image">http://www.four51.com/filedownload.hcf?6BAAA6F9AF8FF</Extrinsic>
          </Extrinsic>
        </ItemDetail>
      </ItemOut>
    </OrderRequest>
  </Request>
</cXML>`;

describe('parseFour51Cxml', () => {
  const order = parseFour51Cxml(SAMPLE);

  it('parses order-level header fields', () => {
    expect(order.orderId).toBe('1320');
    expect(order.orderType).toBe('Standard');
    expect(order.orderDate).toBe('2024-03-30T16:19:25');
    expect(order.payloadId).toBe('abc123@Four51.com');
    expect(order.total).toBe('81.10');
    expect(order.currency).toBe('USD');
    expect(order.sharedSecret).toBe('s3cr3t!');
  });

  it('parses ship-to from the header', () => {
    expect(order.shipToCompany).toBe('Everstory Partners');
    expect(order.shipToName).toBe('Attn: Jane Smith');
    expect(order.shipToCity).toBe('Muncie');
    expect(order.shipToState).toBe('IN');
  });

  it('returns lines sorted by lineNumber', () => {
    expect(order.lines.map((l) => l.lineNumber)).toEqual([1, 2]);
  });

  it('extracts the personalized line with separated title lines', () => {
    const line = order.lines[0];
    expect(line.productId).toBe('BC-6');
    expect(line.variantId).toBe('BC-6-V1');
    expect(line.description).toBe('Business Card');
    expect(line.productType).toBe('VariableText');
    expect(line.quantity).toBe(10);
    expect(line.quantityMultiplier).toBe(250);
    expect(line.unitPrice).toBe('4.00');
    expect(line.productionPdfUrl).toBe('http://www.four51.com/ui/variableimage/PDF/li-k43jo4i.pdf');
    expect(line.titleLine1).toBe('Jane Smith');
    expect(line.titleLine2).toBe('Director of Operations');
    expect(line.specs.CustomerName).toBe('Test Name');
  });

  it('handles a static line with no ProductSpecs', () => {
    const line = order.lines[1];
    expect(line.productId).toBe('J-32321');
    expect(line.productType).toBe('Static');
    expect(line.titleLine1).toBeNull();
    expect(line.titleLine2).toBeNull();
    expect(Object.keys(line.specs)).toHaveLength(0);
  });

  it('throws on a non-cXML document', () => {
    expect(() => parseFour51Cxml('<foo><bar/></foo>')).toThrow(/cXML/);
  });

  it('throws when orderID is missing', () => {
    const noId = SAMPLE.replace('orderID="1320" ', '');
    expect(() => parseFour51Cxml(noId)).toThrow(/orderID/);
  });

  it('handles a single line item (not an array)', () => {
    const single = `<cXML payloadID="p1"><Request><OrderRequest>
      <OrderRequestHeader orderID="9" orderDate="2024-01-01" type="new"/>
      <ItemOut lineNumber="1" quantity="3">
        <ItemID><SupplierPartID>SKU-1</SupplierPartID></ItemID>
        <ItemDetail><Description>Mug</Description>
          <Extrinsic name="ProductSpecs"><Extrinsic name="Line1">Hello</Extrinsic></Extrinsic>
        </ItemDetail>
      </ItemOut>
    </OrderRequest></Request></cXML>`;
    const o = parseFour51Cxml(single);
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].productId).toBe('SKU-1');
    expect(o.lines[0].titleLine1).toBe('Hello');
  });

  it('decodes standard XML entities in imprint text', () => {
    const xml = `<cXML payloadID="p"><Request><OrderRequest>
      <OrderRequestHeader orderID="55" orderDate="2024-01-01" type="new"/>
      <ItemOut lineNumber="1" quantity="1">
        <ItemID><SupplierPartID>S1</SupplierPartID></ItemID>
        <ItemDetail><Extrinsic name="ProductSpecs">
          <Extrinsic name="Title Line 1">Mom &amp; Dad</Extrinsic>
          <Extrinsic name="Title Line 2">O&#39;Brien</Extrinsic>
        </Extrinsic></ItemDetail>
      </ItemOut>
    </OrderRequest></Request></cXML>`;
    const o = parseFour51Cxml(xml);
    expect(o.lines[0].titleLine1).toBe('Mom & Dad');
    expect(o.lines[0].titleLine2).toBe("O'Brien");
  });
});
