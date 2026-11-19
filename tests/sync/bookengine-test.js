/* The guest-facing Maha Booking page (book/index.html): amenities shown the way Cloudbeds does it (a short
   teaser with icons, "+N more" opening a modal grouped the same way the hotel set them up - Hotel Facilities,
   Sports and Recreation), and room rates with an eZee-style "Hurry! N left" badge and a Whole stay / Per night
   price toggle.
     node tests/sync/bookengine-test.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'book');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const catalogSrc = fs.readFileSync(path.join(root, 'catalog.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8');
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

T('the page follows Cloudbeds\' own structure: Property Information, then Amenities, then Address and Contact with an embedded map, then Policies, and only then Available rates - not rates immediately under the hero with everything else buried below',
  src.indexOf('id="meta"') < src.indexOf('id="amenities"') &&
  src.indexOf('id="amenities"') < src.indexOf('id="addrPanel"') &&
  src.indexOf('id="addrPanel"') < src.indexOf('id="policyPanel"') &&
  src.indexOf('id="policyPanel"') < src.indexOf('id="ratesPanel"'));

T('Address and Contact shows phone / email / website and a live OpenStreetMap pin from the property\'s own lat/lng (set under Backend > Booking Engine > Property Information) - hidden when there is nothing to show',
  src.includes("const addrOn = !!(h.addr || h.phone || h.email || h.web);") &&
  src.includes('map.src = `https://www.openstreetmap.org/export/embed.html?bbox=') &&
  src.includes("map.hidden = true;"));

T('an Important Notice (Backend > Booking Engine > Policies & Notices) shows next to the cancellation policy, both fetched through the catalog and the single-hotel API',
  catalogSrc.includes("importantNotice: g.importantNotice || '',") &&
  serverSrc.includes('importantNotice: hotel.importantNotice,') &&
  src.includes("$('notice').innerHTML = h.importantNotice ? `<strong>Important notice:</strong> ${h.importantNotice}` : '';"));

T('the hero shows the hotel logo (synced from Hotel Setup) and fades between up to 8 cover photos every 5 seconds, instead of a single static background',
  src.includes('function renderHero(h) {') &&
  src.includes("$('heroLogo').hidden = !h.logo;") &&
  src.includes('const photos = (h.coverPhotos || []).slice(0, 8);') &&
  src.includes('}, 5000);') &&
  src.includes('.hero-slides img.on{opacity:1}'));

T('each room\'s rate card shows its room type\'s photo (set in PMS Room types) when it has one',
  src.includes('${r.typePhoto ? `<img src="${r.typePhoto}" alt="" style="width:88px;height:66px;object-fit:cover;border-radius:4px;flex:none">` : \'\'}'));

T('the catalog and single-hotel API carry logo, coverPhotos (max 8) and each room type\'s photo through to the guest page',
  catalogSrc.includes("logo: s.logo || ''") &&
  catalogSrc.includes('coverPhotos: Array.isArray(g.coverPhotos) ? g.coverPhotos.slice(0, 8) : []') &&
  catalogSrc.includes("photo: t.photo || ''") &&
  serverSrc.includes('logo: hotel.logo,') &&
  serverSrc.includes('coverPhotos: hotel.coverPhotos,'));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
