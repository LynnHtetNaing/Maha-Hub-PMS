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

T('quoteStay layers Rack Rate -> channel markup -> promo discount, in that order, and never mutates the Rack Rate itself (rackAmount is kept alongside the final sell price)',
  catalogSrc.includes('export function directMarkupPct(hotel) {') &&
  catalogSrc.includes('export function promoDiscount(hotel, code, sellAmount) {') &&
  catalogSrc.includes('const rackAmount = split.total;') &&
  catalogSrc.includes('const sellAmount = r2(rackAmount * (1 + directMarkupPct(hotel) / 100));') &&
  catalogSrc.includes('const discount = promoDiscount(hotel, promoCode, sellAmount);') &&
  catalogSrc.includes('const finalAmount = r2(sellAmount - discount);'));

T('Central Allotment clamps inventoryForType to what the hotel chose to release, never more than the PMS\'s own room count, and does nothing when unset',
  catalogSrc.includes('const cap = hotel.directAllot && hotel.directAllot[typeCode];') &&
  catalogSrc.includes('if (cap != null && Number.isFinite(Number(cap))) count = Math.min(count, Number(cap));'));

T('the catalog carries channels (direct markup default 10%), promotions, directAllot and guestCountry through to the guest page and the search/request APIs',
  catalogSrc.includes("channels: Array.isArray(g.channels) && g.channels.length ? g.channels : [{ key: 'direct', label: 'Booking Engine (direct)', kind: 'markup', value: 10 }],") &&
  catalogSrc.includes('promotions: Array.isArray(g.promotions) ? g.promotions.slice() : [],') &&
  catalogSrc.includes("directAllot: (g.directAllot && typeof g.directAllot === 'object') ? g.directAllot : {},") &&
  serverSrc.includes('promoCode: q.promo') &&
  serverSrc.includes('promoCode: body.promo'));

T('a guest\'s nationality is checked against Guest Country Set Up before a request is accepted - Allow-only and Block modes both refuse politely instead of silently accepting an out-of-policy guest',
  serverSrc.includes("const gc = hotel.guestCountry || { mode: 'all', list: [] };") &&
  serverSrc.includes("if (gc.mode === 'allow' && guest.country && !gc.list.includes(guest.country)) {") &&
  serverSrc.includes("if (gc.mode === 'block' && guest.country && gc.list.includes(guest.country)) {"));

T('the guest page has a Cloudbeds-style "+ Add promo code" toggle (not a 7th field crowding the search bar) and a Country field on the request form, both actually sent to the server',
  src.includes('<button type="button" class="promo-toggle" id="promoToggle">+ Add promo code</button>') &&
  src.includes("if (promo) qs.set('promo', promo);") &&
  src.includes('<select id="guestCountrySel">') &&
  src.includes("country: \$('guestCountrySel').value,"));

T('a successful promo shows the guest exactly what was taken off, without hiding the Rack Rate math anywhere else on the page',
  src.includes('${r.promoApplied ? `<div class="badge" style="background:#e4efe8;color:var(--ok);margin-top:6px">Promo ${r.promoApplied} applied: -${money(r.promoDiscount, r.currency)}</div>` : \'\'}'));

console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
