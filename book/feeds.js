/**
 * Google Hotel Prices feed builders (Hotel List, Landing Pages, ARI).
 * Output matches Google's published XML shapes for local validation and future upload.
 * Does not call Google. partner key must be replaced after Hotel Center onboarding.
 */

import {
  PARTNER_PLACEHOLDER,
  sellableRates,
  rateFor,
  taxSplit,
  inventoryForType,
  isoDate,
  addDays,
  r2
} from './catalog.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function msgId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function partnerKey(catalog) {
  return (catalog && catalog.partnerKey) || PARTNER_PLACEHOLDER;
}

function bookBase(catalog) {
  const b = (catalog && catalog.baseBookUrl) || '';
  return b.replace(/\/+$/, '') || 'https://BOOKING_HOST_REQUIRED/book';
}

/** Hotel List XML (Google local feed shape). */
export function hotelListXml(catalog) {
  const hotels = (catalog.hotels || []).filter(h => h.bookEnabled && h.active !== false);
  const body = hotels.map(h => {
    const lat = h.lat != null && !Number.isNaN(Number(h.lat)) ? `<latitude>${Number(h.lat)}</latitude>` : '';
    const lng = h.lng != null && !Number.isNaN(Number(h.lng)) ? `<longitude>${Number(h.lng)}</longitude>` : '';
    const phone = h.phone ? `<phone type="main">${esc(h.phone)}</phone>` : '';
    const attrs = [];
    if (h.web) attrs.push(`        <website>${esc(h.web.startsWith('http') ? h.web : 'https://' + h.web)}</website>`);
    if (h.brand) attrs.push(`        <client_attr name="hotel_brand">${esc(h.brand)}</client_attr>`);
    const content = attrs.length || h.photoUrl
      ? `<content>
      ${attrs.length ? `<attributes>\n${attrs.join('\n')}\n      </attributes>` : ''}
      ${h.photoUrl ? `<image type="photo" url="${esc(h.photoUrl)}"><link>${esc(h.photoUrl)}</link><title>${esc(h.name)}</title></image>` : ''}
    </content>`
      : '';
    return `  <listing>
    <id>${esc(h.id)}</id>
    <name>${esc(h.name)}</name>
    <address format="simple">
      <component name="addr1">${esc(h.addr || '')}</component>
    </address>
    <country>${esc(h.countryCode || 'TH')}</country>
    ${lat}
    ${lng}
    ${phone}
    <category>${esc(h.category || 'hotel')}</category>
    ${content}
  </listing>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Maha Booking hotel list. NOT uploaded to Google until Connectivity Partner approval. googleLive=${!!(catalog && catalog.googleLive)} -->
<listings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="http://www.gstatic.com/localfeed/local_feed.xsd">
  <language>en</language>
${body || '  <!-- No hotels with direct booking enabled -->'}
</listings>
`;
}

/** Landing pages / PointsOfSale XML. */
export function landingPagesXml(catalog) {
  const base = bookBase(catalog);
  const url = `${base}/?hotel=(PARTNER-HOTEL-ID)&amp;checkin=(CHECKINYEAR)-(CHECKINMONTH)-(CHECKINDAY)&amp;checkout=(CHECKOUTYEAR)-(CHECKOUTMONTH)-(CHECKOUTDAY)&amp;adults=(NUM-ADULTS)&amp;children=(NUM-CHILDREN)&amp;lang=(USER-LANGUAGE)`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Maha Booking landing pages. Upload in Hotel Center only after Google onboarding. -->
<PointsOfSale>
  <PointOfSale id="maha-booking">
    <DisplayNames display_text="Maha Booking" display_language="en"/>
    <Match status="yes" language="en"/>
    <Match status="yes" language="th"/>
    <Match status="yes" country="TH"/>
    <Match status="yes" country="MM"/>
    <Match status="yes" currency="THB"/>
    <Match status="yes" currency="MMK"/>
    <Match status="yes" currency="USD"/>
    <URL>${url}</URL>
  </PointOfSale>
</PointsOfSale>
`;
}

/** ARI Transaction (property data) for one hotel. */
export function ariTransactionXml(catalog, hotelId) {
  const hotel = (catalog.hotels || []).find(h => h.id === hotelId);
  if (!hotel) throw new Error('hotel-not-found');
  const rooms = (hotel.roomTypes || []).filter(t => !t.dummy).map(t => `    <RoomData>
      <RoomID>${esc(t.code)}</RoomID>
      <Name><Text text="${esc(t.name)}" language="en"/></Name>
      <Capacity>${Number(t.max || 2)}</Capacity>
      <AdultCapacity>${Number(t.max || 2)}</AdultCapacity>
    </RoomData>`).join('\n');
  const packages = sellableRates(hotel).map(r => {
    const refundable = !(r.code || '').includes('NRF');
    return `    <PackageData>
      <PackageID>${esc(r.code)}</PackageID>
      <Name><Text text="${esc(r.desc || r.code)}" language="en"/></Name>
      <Description><Text text="Direct booking through Maha Booking" language="en"/></Description>
      <Refundable available="${refundable ? 'true' : 'false'}"${refundable ? ' refundable_until_days="1" refundable_until_time="12:00"' : ''}/>
      <Breakfast included="${r.meal === 'ABF' ? 'true' : 'false'}"/>
    </PackageData>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ARI Transaction. Do not POST to Google without a real partner key and Hotel Center setup. -->
<Transaction timestamp="${stamp()}" id="${msgId('txn')}" partner="${esc(partnerKey(catalog))}">
  <PropertyDataSet action="overlay">
    <Property>${esc(hotel.id)}</Property>
${rooms}
${packages}
  </PropertyDataSet>
</Transaction>
`;
}

/** OTA_HotelRateAmountNotifRQ for a date window (default 30 nights). */
export function ariRateAmountXml(catalog, hotelId, opts = {}) {
  const hotel = (catalog.hotels || []).find(h => h.id === hotelId);
  if (!hotel) throw new Error('hotel-not-found');
  const start = opts.start || isoDate(new Date());
  const days = Number(opts.days || 30);
  const end = addDays(start, days - 1);
  const messages = [];
  for (const t of (hotel.roomTypes || []).filter(x => !x.dummy)) {
    for (const r of sellableRates(hotel)) {
      const after = rateFor(hotel, t.code, r.code);
      if (after < 1) continue;
      const split = taxSplit(hotel, after);
      const before = r2(split.net + split.svc);
      messages.push(`    <RateAmountMessage>
      <StatusApplicationControl Start="${start}" End="${end}" InvTypeCode="${esc(t.code)}" RatePlanCode="${esc(r.code)}"/>
      <Rates>
        <Rate>
          <BaseByGuestAmts>
            <BaseByGuestAmt AmountBeforeTax="${before}" AmountAfterTax="${after}" CurrencyCode="${esc(hotel.cur)}" NumberOfGuests="${Number(t.max || 2)}"/>
          </BaseByGuestAmts>
        </Rate>
      </Rates>
    </RateAmountMessage>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ARI rates. Not pushed to Google from this foundation build. -->
<OTA_HotelRateAmountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
                            EchoToken="${msgId('rate')}"
                            TimeStamp="${stamp()}"
                            Version="3.0"
                            NotifType="Overlay"
                            NotifScopeType="ProductRate">
  <POS>
    <Source>
      <RequestorID ID="${esc(partnerKey(catalog))}"/>
    </Source>
  </POS>
  <RateAmountMessages HotelCode="${esc(hotel.id)}">
${messages.join('\n')}
  </RateAmountMessages>
</OTA_HotelRateAmountNotifRQ>
`;
}

/** OTA_HotelAvailNotifRQ — open/close by inventory for a window. */
export function ariAvailXml(catalog, hotelId, opts = {}) {
  const hotel = (catalog.hotels || []).find(h => h.id === hotelId);
  if (!hotel) throw new Error('hotel-not-found');
  const start = opts.start || isoDate(new Date());
  const days = Number(opts.days || 30);
  const messages = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    for (const t of (hotel.roomTypes || []).filter(x => !x.dummy)) {
      const inv = inventoryForType(hotel, t.code, day);
      for (const r of sellableRates(hotel)) {
        messages.push(`    <AvailStatusMessage>
      <StatusApplicationControl Start="${day}" End="${day}" InvTypeCode="${esc(t.code)}" RatePlanCode="${esc(r.code)}"/>
      <RestrictionStatus Status="${inv > 0 ? 'Open' : 'Close'}" Restriction="Master"/>
    </AvailStatusMessage>`);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ARI availability. Not pushed to Google from this foundation build. -->
<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
                       EchoToken="${msgId('avail')}"
                       TimeStamp="${stamp()}"
                       Version="3.0">
  <POS>
    <Source>
      <RequestorID ID="${esc(partnerKey(catalog))}"/>
    </Source>
  </POS>
  <AvailStatusMessages HotelCode="${esc(hotel.id)}">
${messages.join('\n')}
  </AvailStatusMessages>
</OTA_HotelAvailNotifRQ>
`;
}

/** OTA_HotelInvCountNotifRQ — sellable counts by room type. */
export function ariInvCountXml(catalog, hotelId, opts = {}) {
  const hotel = (catalog.hotels || []).find(h => h.id === hotelId);
  if (!hotel) throw new Error('hotel-not-found');
  const start = opts.start || isoDate(new Date());
  const days = Number(opts.days || 30);
  const messages = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    for (const t of (hotel.roomTypes || []).filter(x => !x.dummy)) {
      const inv = inventoryForType(hotel, t.code, day);
      messages.push(`    <Inventory>
      <StatusApplicationControl Start="${day}" End="${day}" InvTypeCode="${esc(t.code)}"/>
      <InvCounts>
        <InvCount CountType="2" Count="${inv}"/>
      </InvCounts>
    </Inventory>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ARI inventory counts. Not pushed to Google from this foundation build. -->
<OTA_HotelInvCountNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05"
                          EchoToken="${msgId('inv')}"
                          TimeStamp="${stamp()}"
                          Version="3.0">
  <POS>
    <Source>
      <RequestorID ID="${esc(partnerKey(catalog))}"/>
    </Source>
  </POS>
  <Inventories HotelCode="${esc(hotel.id)}">
${messages.join('\n')}
  </Inventories>
</OTA_HotelInvCountNotifRQ>
`;
}

export function statusJson(catalog) {
  return {
    product: 'Maha Booking Engine',
    version: catalog.version || null,
    googleLive: false,
    googleConnectivityPartner: false,
    partnerKeyConfigured: !!(catalog.partnerKey && catalog.partnerKey !== PARTNER_PLACEHOLDER),
    hotelsEnabled: (catalog.hotels || []).filter(h => h.bookEnabled && h.active !== false).length,
    hotelsTotal: (catalog.hotels || []).length,
    updatedAt: catalog.updatedAt || null,
    note: 'Feeds can be downloaded for preparation. Google Search / Maps will not show Maha links until Padauk completes Google approval and Hotel Center certification.'
  };
}
