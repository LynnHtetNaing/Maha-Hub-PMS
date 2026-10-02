/**
 * Local smoke test for Maha Booking feed builders and search.
 * Does not contact Google.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchHotel, readiness, isoDate, addDays } from './catalog.js';
import {
  hotelListXml,
  landingPagesXml,
  ariTransactionXml,
  ariRateAmountXml,
  ariAvailXml,
  ariInvCountXml,
  statusJson
} from './feeds.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const hotel = cat.hotels[0];
const checkin = isoDate(new Date());
const checkout = addDays(checkin, 2);
const results = searchHotel(hotel, { checkin, checkout, adults: 2 });
const ready = readiness(hotel);
const list = hotelListXml(cat);
const pos = landingPagesXml(cat);
const txn = ariTransactionXml(cat, hotel.id);
const rates = ariRateAmountXml(cat, hotel.id, { days: 3 });
const avail = ariAvailXml(cat, hotel.id, { days: 3 });
const inv = ariInvCountXml(cat, hotel.id, { days: 3 });
const st = statusJson(cat);

const asserts = [
  ['catalog has hotels', cat.hotels.length >= 1],
  ['search returns rows', results.length > 0],
  ['search has available room', results.some(r => r.available)],
  ['readiness not google approved', ready.googleApproved === false],
  ['status googleLive false', st.googleLive === false],
  ['hotel list root', list.includes('<listings') && list.includes(`<id>${hotel.id}</id>`)],
  ['landing pages root', pos.includes('<PointsOfSale>') && pos.includes('(PARTNER-HOTEL-ID)')],
  ['transaction partner placeholder', txn.includes('YOUR_GOOGLE_PARTNER_KEY')],
  ['rates OTA root', rates.includes('OTA_HotelRateAmountNotifRQ')],
  ['avail OTA root', avail.includes('OTA_HotelAvailNotifRQ')],
  ['inventory OTA root', inv.includes('OTA_HotelInvCountNotifRQ')],
  ['not claiming live in list comment', list.includes('NOT uploaded to Google') || list.includes('NOT uploaded')]
];

let failed = 0;
for (const [label, ok] of asserts) {
  if (!ok) {
    console.error('FAIL', label);
    failed += 1;
  } else {
    console.log('OK  ', label);
  }
}
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${asserts.length} checks passed. googleLive=false`);
