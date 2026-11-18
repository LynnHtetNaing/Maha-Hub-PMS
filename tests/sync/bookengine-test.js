/* The guest-facing Maha Booking page (book/index.html): amenities shown the way Cloudbeds does it (a short
   teaser with icons, "+N more" opening a modal grouped the same way the hotel set them up - Hotel Facilities,
   Sports and Recreation), and room rates with an eZee-style "Hurry! N left" badge and a Whole stay / Per night
   price toggle.
     node tests/sync/bookengine-test.js */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'book', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

T('amenities are grouped the same way as the hotel\'s own Direct Booking Engine setup (Hotel Facilities, Sports and Recreation), not a flat list',
  src.includes("const AMEN_GROUPS = [") && src.includes("{ t: 'Hotel Facilities', items: [") && src.includes("{ t: 'Sports and Recreation', items: ["));

T('the page shows a short amenities teaser with icons and a "+N more" link, not the whole list at once',
  src.includes('function renderAmenities(list)') &&
  src.includes('const teaser = list.slice(0, 5);') &&
  src.includes('>+${rest} more</button>'));

T('"+N more" opens a modal listing every amenity the property actually has, grouped under its own heading, with a close button and a click-outside-to-close overlay',
  src.includes('id="amenOverlay"') && src.includes('id="amenFull"') && src.includes('id="amenClose"') &&
  src.includes("$('amenClose').onclick = () => { $('amenOverlay').hidden = true; };") &&
  src.includes("$('amenOverlay').onclick = (e) => { if (e.target.id === 'amenOverlay') $('amenOverlay').hidden = true; };"));

T('a room with 3 or fewer left is called out as "Hurry! N left" (eZee-style urgency), not just a plain count; sold out still says Sold out',
  src.includes('const low = r.available && r.inventory > 0 && r.inventory <= 3;') &&
  src.includes("low ? 'Hurry! ' + r.inventory + ' left' : r.inventory + ' left'") &&
  src.includes("'Sold out'"));

T('a multi-night rate gets a Whole stay / Per night price toggle that recomputes the shown price and its caption, not just a static total',
  src.includes("r.nights > 1 ? `<div class=\"pricetog\" data-tog=\"${i}\">") &&
  src.includes("priceEl.textContent = money(r.amountAfterTax / r.nights, r.currency);") &&
  src.includes("subEl.textContent = 'per night incl. tax';"));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
