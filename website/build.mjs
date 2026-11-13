/* Builds the Maha Hub Group of Companies website into the repository root (GitHub Pages serves it from there).
     node website/build.mjs
   Pages are written as plain .html files. Legal text lives in website/content/. Edit this file or those, then run it again. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://maha-hub.com';
const COMPANY = 'Maha Hub Group of Companies Limited';
const ADDRESS = '222/B Min Ye Kyaw Swar 3rd Street, Yangon 11091, Myanmar (Burma)';   /* registered address (parent company) */
const PHONE = '+95 9 450 015 567', PHONE_TEL = '+959450015567';
const OFFICE = 'Bangkok, Thailand (Operation Office)', OFFICE_PHONE = '+66-641081434', OFFICE_TEL = '+66641081434';
const EMAIL = 'hello@maha-hub.com';
const SUPPORT = 'support@maha-hub.com';
const content = n => fs.readFileSync(path.join(ROOT, 'website', 'content', n), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- small icons (line style) ---------- */
const I = {
  hub: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="6"/><circle cx="8" cy="10" r="3.5"/><circle cx="40" cy="10" r="3.5"/><circle cx="8" cy="38" r="3.5"/><circle cx="40" cy="38" r="3.5"/><path d="M10.6 12.4l8.8 7.4M37.4 12.4l-8.8 7.4M10.6 35.6l8.8-7.4M37.4 35.6l-8.8-7.4"/></svg>',
  cap: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18L24 8l21 10-21 10L3 18z"/><path d="M11 22.5V32c0 3.5 6.2 7 13 7s13-3.5 13-7v-9.5"/><path d="M45 18v13"/></svg>',
  shield: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 4l16 6v12c0 10-6.8 18-16 22C14.8 40 8 32 8 22V10l16-6z"/><path d="M16.5 24l5 5 10-11"/></svg>',
  people: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="17" cy="15" r="6"/><circle cx="34" cy="18" r="4.5"/><path d="M4 40c0-7.5 5.8-12 13-12s13 4.5 13 12M30 29c1.4-.6 2.9-.9 4.5-.9 5.4 0 9.5 3.4 9.5 9"/></svg>',
  bed: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 38V12M5 28h38v10M43 28v-5a6 6 0 00-6-6H20v11"/><circle cx="12" cy="21" r="3.5"/></svg>',
  bell: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 36h36M10 36a14 14 0 0128 0M24 14v-4M20 10h8"/></svg>',
  broom: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M30 6l-8 16M18 22l-8 18h28l-6-18z"/><path d="M16 32h16M14 36h20"/></svg>',
  cup: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8h26v14a13 13 0 01-26 0V8zM34 12h4a5 5 0 010 10h-5M6 42h32"/></svg>',
  chart: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6v36h36"/><path d="M14 32l8-9 7 6 11-14"/></svg>',
  chat: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10h36v22H20l-9 8v-8H6V10z"/><path d="M14 19h20M14 25h12"/></svg>',
  screen: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="38" height="26" rx="3"/><path d="M16 42h16M24 33v9M13 18h8M13 24h14"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/></svg>',
  life: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/></svg>',
  arr: '<svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  car: '<svg class="car" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>',
  orn: '<svg class="orn" viewBox="0 0 240 28" aria-hidden="true"><path d="M2 14h70M168 14h70" stroke="currentColor" stroke-width="1"/><path d="M72 14c9 0 13-9 22-9 7 0 9 7 3 9-5 2-8-3-4-5M168 14c-9 0-13-9-22-9-7 0-9 7-3 9 5 2 8-3 4-5M80 14c8 0 12 7 20 7 5 0 6-4 2-5M160 14c-8 0-12 7-20 7-5 0-6-4-2-5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M120 2c7 6 9 11 0 23-9-12-7-17 0-23z" fill="currentColor"/><circle cx="108" cy="14" r="1.6" fill="currentColor"/><circle cx="132" cy="14" r="1.6" fill="currentColor"/></svg>',
};

/* ---------- products ---------- */
const PRODUCTS = [
  { id: 'pms', name: 'Maha PMS', kind: 'Property management system', live: true, blurb: 'The command centre for your property: rooms, rates and reservations in one refined workspace.',
    long: 'The foundation of Maha Solutions. Property, rooms, rates, reservations, front office and billing, brought together in a single, connected workspace.',
    features: ['Property and rooms', 'Rates', 'Reservations', 'Front office', 'Folio and billing', 'Guest profiles', 'Housekeeping', 'Reports', 'User roles'] },
  { id: 'connect', name: 'Maha Connect', kind: 'Channel distribution', live: false, blurb: 'Place your inventory across global channels, with rates and availability held in perfect step.',
    long: 'Channel distribution designed for the discerning operator, keeping rooms and rates precisely aligned across every channel you sell on.',
    features: ['Inventory distribution', 'Rates across channels', 'Connected to Maha PMS'] },
  { id: 'booking', name: 'Maha Booking', kind: 'Direct booking', live: false, blurb: 'Invite guests to book directly with you, on your own website.',
    long: 'A direct booking engine for your own website, inviting guests to reserve with you rather than through an intermediary.',
    features: ['Direct bookings on your website', 'Rooms and rates from Maha PMS', 'Reservations created in Maha PMS'] },
  { id: 'reach', name: 'Maha Reach', kind: 'Marketing and guest engagement', live: false, blurb: 'Cultivate your brand and your guest relationships.',
    long: 'Marketing and guest engagement for hotels: stay close to your guests and strengthen your brand with every interaction.',
    features: ['Marketing', 'Campaigns', 'Guest engagement'] },
  { id: 'sales', name: 'Maha Sales', kind: 'Sales', live: false, blurb: 'Hotel leads, follow-ups and quotations, managed with discipline.',
    long: 'Leads, follow-ups and quotations for hotel sales teams, available from the same Maha sign-in.',
    features: ['Leads', 'Follow-ups', 'Quotations'] },
  { id: 'travel', name: 'Maha Travel', kind: 'Online travel agency', live: false, blurb: 'Our own online travel channel, connecting guests directly with Maha hotels.',
    long: 'Maha Travel is our own online travel agency, designed to connect guests directly with Maha hotels, with reservations flowing into Maha PMS and rates held in step through Maha Connect.',
    features: ['Our own travel channel', 'Reservations into Maha PMS', 'Rates through Maha Connect'] },
  { id: 'hr', name: 'Maha HR', kind: 'People', live: false, blurb: 'Team, attendance and payroll.', long: 'People management for hotel teams: records, attendance and payroll.', features: ['Team', 'Attendance', 'Payroll'] },
  { id: 'account', name: 'Maha Account', kind: 'Finance', live: false, blurb: 'Accounting and finance.', long: 'Accounting and financial control, designed for hotels.', features: ['Accounting', 'Finance'] },
  { id: 'manage', name: 'Maha Manage', kind: 'Back office', live: false, blurb: 'Back office and multi-property.', long: 'Back-office tools and consolidated management reporting across multiple properties.', features: ['Back office', 'Multi-property'] },
  { id: 'pos', name: 'Maha POS', kind: 'Point of sale', live: false, blurb: 'F&B and retail point of sale.', long: 'Point of sale for food and beverage and retail outlets.', features: ['F&B', 'Retail'] },
  { id: 'stock', name: 'Maha Stock', kind: 'Inventory', live: false, blurb: 'Inventory and suppliers.', long: 'Inventory and supplier management for hotel operations.', features: ['Inventory', 'Suppliers'] },
];
const LIVE = PRODUCTS.filter(p => p.live), SOON = PRODUCTS.filter(p => !p.live);
const DEV = ['connect', 'booking', 'reach', 'sales', 'travel'];   /* in development and shown as cards; the rest are listed together */
const prodCard = (p, full) => '<article class="card prod reveal"><span class="tag ' + (p.live ? 'on' : 'soon') + '">' + (p.live ? 'Available now' : 'In development') + '</span><h3>' + p.name + '</h3><div class="kind">' + p.kind + '</div><p>' + p.blurb + '</p>' + (full ? '<ul>' + p.features.slice(0, 3).map(f => '<li>' + f + '</li>').join('') + '</ul>' : '') + '<a class="more" href="' + (p.id === 'travel' ? '/maha-travel' : '/products#' + p.id) + '">Learn more ' + I.arr + '</a></article>';
const moreCard = '<article class="card prod reveal" style="background:linear-gradient(160deg,#0A3020,#184D3A)"><span class="tag soon">In development</span><h3 style="color:var(--gold2)">Further products</h3><p style="color:#d8e8df">' + SOON.filter(p => !DEV.includes(p.id)).map(p => p.name).join(', ') + '.</p><a class="more" style="color:var(--gold2)" href="/products#soon">See what is planned ' + I.arr + '</a></article>';

/* ---------- shared page parts ---------- */
const NAV = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'about', href: '/about', label: 'About' },
  { key: 'solutions', label: 'Maha Solutions', menu: [
    ['/maha-hub-solutions', 'Overview', 'Connected hotel software'], ['/products', 'Products', 'Maha PMS today, more in development'], ['/maha-travel', 'Maha Travel', 'Our own travel channel, in development'],
    ['/pricing', 'Pricing', 'Plans and how buying works'], ['/security', 'Security', 'How we protect hotel data']] },
  { key: 'academy', href: '/maha-hub-academy', label: 'Maha Academy' },
  { key: 'contact', href: '/contact', label: 'Contact' },
];
const head = ({ title, desc, canon, image = '/brand/pms/icon-512.png', noindex = false, ld = '' }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${COMPANY}">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">' : '<meta name="robots" content="index,follow">'}
<link rel="canonical" href="${SITE}${canon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Maha Hub Group of Companies">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${canon}">
<meta property="og:image" content="${SITE}${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#113732">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/icons/maha-mark-sq.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;600;700&family=Noto+Sans+Myanmar:wght@400;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;600;700&family=Noto+Sans+Myanmar:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="/assets/group.css">${ld ? '\n' + ld : ''}
</head>`;

const header = active => `<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-in">
    <a class="logo" href="/" aria-label="Maha Hub Group of Companies, home">
      <img src="/brand/maha/gate-gold.png" alt="" width="44" height="44">
      <span><b>MAHA HUB</b><small>GROUP OF COMPANIES</small></span>
    </a>
    <nav class="nav" id="nav" aria-label="Main">
      ${NAV.map(n => n.menu
        ? `<div class="dd${active === n.key ? ' on' : ''}"><button type="button" aria-expanded="false" aria-haspopup="true">${n.label} ${I.car}</button><div class="dd-menu">${n.menu.map(m => `<a href="${m[0]}">${m[1]}<small>${m[2]}</small></a>`).join('')}</div></div>`
        : `<a href="${n.href}"${active === n.key ? ' class="on" aria-current="page"' : ''}>${n.label}</a>`).join('\n      ')}
      <div class="m-cta"><a class="btn btn-line-dark sm" href="/solutions">Sign in</a><button class="btn btn-green sm" type="button" data-book="demo">Book a Demo</button></div>
    </nav>
    <div class="head-cta"><a class="signin" href="/solutions">Sign in</a><button class="btn btn-green sm" type="button" data-book="demo">Book a Demo</button></div>
    <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div>
</header>
<main id="main">`;

const footer = () => `</main>
<footer class="site-foot">
  <div class="wrap foot-top">
    <div class="foot-brand">
      <a class="logo" href="/"><img src="/brand/maha/gate-gold.png" alt="" width="44" height="44" loading="lazy"><span><b>MAHA HUB</b><small>GROUP OF COMPANIES</small></span></a>
      <p>${COMPANY}. Technology and talent for modern hospitality.</p>
      <p>${ADDRESS}<br>Tel <a href="tel:${PHONE_TEL}">${PHONE}</a></p>
      <p><b>Office</b><br>${OFFICE}<br>Tel <a href="tel:${OFFICE_TEL}">${OFFICE_PHONE}</a></p>
    </div>
    <div><h4>Our brands</h4><ul><li><a href="/maha-hub-solutions">Maha Solutions</a></li><li><a href="/products">Products</a></li><li><a href="/maha-travel">Maha Travel</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/maha-hub-academy">Maha Academy</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="/about">About the Group</a></li><li><a href="/security">Security</a></li><li><a href="/contact">Contact</a></li><li><a href="/solutions">Customer sign in</a></li></ul></div>
    <div><h4>Contact</h4><ul><li><a href="mailto:${EMAIL}">${EMAIL}</a></li><li><a href="mailto:${SUPPORT}">${SUPPORT}</a></li><li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Service</a></li><li><a href="/refund">Refund Policy</a></li></ul></div>
  </div>
  <div class="wrap foot-bottom">
    <span>&copy; <span data-year>2026</span> ${COMPANY}. All rights reserved.</span>
    <span>Maha Solutions &middot; Maha Academy</span>
  </div>
</footer>
<script src="/assets/group.js" defer></script>
</body>
</html>
`;

/* the real screens of our systems (demo data), taken with tools/site-shots.mjs */
const SHOT = { 'pms-dashboard': 'Maha PMS: manager dashboard', 'pms-status': 'Maha PMS: room status', 'pms-grid': 'Maha PMS: room grid', 'pms-inhouse': 'Maha PMS: in-house guests', 'pms-housekeeping': 'Maha PMS: housekeeping', 'pms-roomstatus': 'Maha PMS: rooms', 'pms-arrivals': 'Maha PMS: arrivals' };
/* a laptop whose screen changes by itself; names = files in /assets/site */
const cyc = (names, cls = '', cap = false) => `<div class="cyc ${cls}">${names.map((n, i) => `<img src="/assets/site/${n}.webp" alt="${SHOT[n]} (demo data)" data-cap="${SHOT[n]}" width="1755" height="1170"${i ? ' loading="lazy"' : ' fetchpriority="high"'}>`).join('')}${cap ? '<span class="cap"></span>' : ''}</div>`;
const laptop = names => `<div class="dev"><div class="laptop"><div class="dots"><i></i><i></i><i></i></div>${cyc(names)}</div></div>`;

const ctaBand = (h = 'Experience Maha in your hotel.', p = 'Book a demonstration, or speak with our team for ten minutes. Choose a time that suits you, in your own time zone.', extra = '', primary = null) => `<section class="cta"><div class="wrap"><div class="cta-in reveal">
  <div><h2>${h}</h2><p>${p}</p></div>
  <div class="hero-cta">${primary ? `<a class="btn btn-gold" href="${primary[0]}">${primary[1]} ${I.arr}</a>` : '<button class="btn btn-gold" type="button" data-book="demo">Book a Demo</button>'}${extra || '<button class="btn btn-line" type="button" data-book="talk">Talk with the Team</button>'}</div>
</div></div></section>`;

const pageHero = ({ crumb, eyebrow, h1, lead, shot = null, actions = false }) => `<section class="page-hero${shot ? ' has-shot' : ''}">
  <div class="aurora"><i></i><i></i><i></i></div>
  <div class="wrap">
    <div>
      <p class="crumb"><a href="/">Home</a> / ${crumb}</p>
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
      <h1>${h1}</h1>
      <p class="lead">${lead}</p>
      ${actions ? '<div class="hero-cta"><button class="btn btn-green" type="button" data-book="demo">Book a Demo</button><button class="btn btn-line-dark" type="button" data-book="talk">Talk with the Team</button></div>' : ''}
    </div>
    ${shot ? laptop(shot) : ''}
  </div>
</section>`;

const orgLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Organization', name: COMPANY, url: SITE, logo: SITE + '/brand/pms/icon-512.png', email: EMAIL, telephone: PHONE_TEL,
  address: { '@type': 'PostalAddress', streetAddress: '222/B Min Ye Kyaw Swar 3rd Street', addressLocality: 'Yangon', postalCode: '11091', addressCountry: 'MM' },
  brand: [{ '@type': 'Brand', name: 'Maha Solutions' }, { '@type': 'Brand', name: 'Maha Academy' }],
})}</script>`;

const pages = {};
const add = (file, active, meta, body) => { pages[file] = head({ ...meta, canon: meta.canon }) + '\n' + header(active) + '\n' + body + '\n' + footer(); };

/* ===================================================== HOME ===================================================== */
add('index.html', 'home', {
  title: 'Maha Hub Group of Companies | Technology and education for modern hospitality',
  desc: 'Maha Hub Group of Companies Limited: Maha Solutions, connected software for hotels, and Maha Academy, practical education for hospitality.',
  canon: '/', ld: orgLd,
}, `<section class="hero">
  <div class="aurora"><i></i><i></i><i></i></div>
  <div class="wrap hero-in">
    <div>
      <p class="eyebrow">${COMPANY}</p>
      <h1>Where hospitality meets <em>technology and talent</em>.</h1>
      <p class="lead">One group, two distinguished brands. Maha Solutions builds the connected systems behind exceptional hotels. Maha Academy develops the people who lead them.</p>
      <div class="hero-cta"><button class="btn btn-green" type="button" data-book="demo">Book a Demo ${I.arr}</button><button class="btn btn-line-dark" type="button" data-book="talk">Talk with the Team</button></div>
      <div class="trust"><span>Designed for hotel teams</span><span>One secure sign-in</span><span>Transparent about what is available today</span></div>
    </div>
    <div class="dev still">
      <div class="laptop"><div class="dots"><i></i><i></i><i></i></div>${cyc(['pms-status'], 'still', false)}</div>
      <div class="float a"><i>&#10003;</i>One hotel record, shared by every team</div><div class="float b"><i>&#9733;</i>Direct bookings, effortlessly recorded</div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">Our brands</p><h2>Two brands. One purpose.</h2><p class="lead">Each brand holds its own distinct focus. Together, they serve hotels and the people who make them exceptional.</p></div>
    <div class="brands">
      <article class="card brand-card sol reveal">
        <img class="bc-mark" src="/brand/pms/bar-mark.png" alt="" aria-hidden="true">
        <span class="brand-tag">Technology</span>
        <div class="brand-ico">${I.hub}</div>
        <h3>Maha Solutions</h3>
        <p>Connected software for hotels and accommodation businesses: property management, channel distribution, direct booking, guest engagement and sales, all drawing on a single source of hotel data.</p>
        <ul class="ticks"><li>Maha PMS today, with Connect, Booking, Reach, Sales and Travel in development</li><li>One sign-in, tailored to each hotel</li><li>Further products in development</li></ul>
        <div class="btns"><a class="btn btn-gold" href="/maha-hub-solutions">Discover Solutions ${I.arr}</a><a class="btn btn-line" href="/solutions">Sign in</a></div>
      </article>
      <article class="card brand-card aca reveal">
        <img class="bc-mark" src="/brand/pms/bar-mark.png" alt="" aria-hidden="true">
        <span class="brand-tag">Education</span>
        <div class="brand-ico">${I.cap}</div>
        <h3>Maha Academy</h3>
        <p>Practical hospitality education for those beginning a career and for hotel teams committed to growth: front office, housekeeping, food and beverage, guest service and hotel management.</p>
        <ul class="ticks"><li>Hands-on learning grounded in real hotel operations</li><li>For newcomers, established teams and senior managers</li><li>Programmes opening soon</li></ul>
        <div class="btns"><a class="btn btn-green" href="/maha-hub-academy">Discover the Academy ${I.arr}</a><a class="btn btn-line-dark" href="/contact?interest=Maha%20Hub%20Academy">Register interest</a></div>
      </article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">See it working</p><h2>See the platform as your team will.</h2><p class="lead">Live screens from Maha PMS, shown here with sample data. Select a screen to view it in detail.</p></div>
    <div class="show reveal">
      <div class="tabs" role="tablist">
        <button class="tab on" type="button" role="tab"><b>Manager dashboard</b><span>The day at a glance: arrivals, departures and revenue</span><i></i></button>
        <button class="tab" type="button" role="tab"><b>Hotel status</b><span>Arrivals, departures and room status</span><i></i></button>
        <button class="tab" type="button" role="tab"><b>Room grid</b><span>A fortnight of bookings, seen at a glance</span><i></i></button>
        <button class="tab" type="button" role="tab"><b>Housekeeping</b><span>Every room, floor by floor, with its housekeeping status</span><i></i></button>
      </div>
      <div class="stage"><div class="cyc">${['pms-dashboard', 'pms-status', 'pms-grid', 'pms-housekeeping'].map((n, i) => `<img src="/assets/site/${n}.webp" alt="${SHOT[n]} (demo data)" data-cap="${SHOT[n]}" width="1755" height="1170"${i ? ' loading="lazy"' : ''}>`).join('')}</div></div>
    </div>
  </div>
</section>

<section class="section paper">
  <div class="wrap">
    <div class="sec-head reveal"><p class="eyebrow">Maha Solutions</p><h2>Every part of your hotel, working as one.</h2><p class="lead">Maha PMS is available today. Maha Connect, Maha Booking, Maha Reach, Maha Sales and Maha Travel are in development and not yet available. Each will draw on the same hotel data rather than standing alone.</p></div>
    <div class="grid g3">
      ${PRODUCTS.filter(p => p.live || DEV.includes(p.id)).map(p => prodCard(p, true)).join('')}
      ${moreCard}
    </div>
  </div>
</section>

<section class="section alt">
  <div class="wrap split">
    <div class="frame reveal"><img src="/assets/banners/golden.jpg" alt="Golden pagodas at sunrise with hot air balloons" loading="lazy" width="1590" height="1030"></div>
    <div class="reveal">
      <p class="eyebrow">About the Group</p>
      <h2>Built for hospitality, from every angle.</h2>
      <p class="lead">${COMPANY} was founded to serve the hospitality industry with the tools hotels depend on and the training their people grow through.</p>
      <p>Exceptional hospitality is the result of two things working in harmony: well-connected systems and well-prepared people. Our two brands exist to support both, and we remain candid about what is available today and what is still being built.</p>
      <div class="hero-cta"><a class="btn btn-line-dark" href="/about">Read about the Group</a><button class="btn btn-green" type="button" data-book="talk">Talk with the Team</button></div>
    </div>
  </div>
</section>

<section class="section dark">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">Maha Academy</p><h2>The skills behind exceptional service.</h2><p class="lead">Education for the front line and the management office. Programme details and dates will be announced here as they are confirmed.</p></div>
    <div class="grid g3">
      <div class="card reveal"><div class="ico">${I.bell}</div><h3>Front office</h3><p>Reservations, arrivals, billing and guest service, delivered with poise at the front desk.</p></div>
      <div class="card reveal"><div class="ico">${I.broom}</div><h3>Housekeeping</h3><p>Room standards, cleaning routines and close coordination with the front desk.</p></div>
      <div class="card reveal"><div class="ico">${I.cup}</div><h3>Food and beverage</h3><p>Service standards, guest care and the fundamentals of running an outlet.</p></div>
      <div class="card reveal"><div class="ico">${I.chart}</div><h3>Hotel management</h3><p>Leading a team, controlling cost and growing revenue with confidence.</p></div>
      <div class="card reveal"><div class="ico">${I.chat}</div><h3>Guest service</h3><p>Communication, problem solving and genuine care for every guest.</p></div>
      <div class="card reveal"><div class="ico">${I.screen}</div><h3>Hotel technology</h3><p>Mastering modern hotel systems with confidence, including training on Maha PMS.</p></div>
    </div>
    <p class="center" style="margin:36px 0 0"><a class="btn btn-gold" href="/maha-hub-academy">Discover the Academy ${I.arr}</a></p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">How we work</p><h2>The principles we work by.</h2></div>
    <div class="grid g3">
      <div class="card value reveal"><div class="num">01</div><h3>Connected, never separate</h3><p>Systems and people perform best when they share the same information and the same standards.</p></div>
      <div class="card value reveal"><div class="num">02</div><h3>Transparent about what is ready</h3><p>We state clearly what is available now and what is to come, so that you can plan with confidence.</p></div>
      <div class="card value reveal"><div class="num">03</div><h3>Designed for hotel teams</h3><p>Front desk, housekeeping, sales and management each receive tools and training suited to their work.</p></div>
    </div>
  </div>
</section>
${ctaBand()}`);

/* ===================================================== ABOUT ===================================================== */
add('about.html', 'about', {
  title: 'About the Group | Maha Hub Group of Companies',
  desc: 'About Maha Hub Group of Companies Limited and its two brands, Maha Solutions and Maha Academy.', canon: '/about',
}, `${pageHero({ crumb: 'About the Group', eyebrow: 'About the Group', h1: 'A group devoted to hospitality, in technology and in education.', lead: `${COMPANY} brings software and learning together, in service of hotels and the people who make them exceptional.`, img: '/assets/banners/golden.jpg', pos: '50% 40%' })}
<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <p class="eyebrow">Who we are</p>
      <h2>One group, two brands.</h2>
      <p class="lead">${COMPANY} is the parent of Maha Solutions and Maha Academy.</p>
      <p><b>Maha Solutions</b> is our technology brand. It offers connected software for hotels and accommodation businesses, beginning with Maha PMS and growing into a family of products that share a single source of hotel data.</p>
      <p><b>Maha Academy</b> is our education brand. It is being created to offer practical hospitality education, from front-line skills to hotel management.</p>
    </div>
    <div class="grid" style="gap:18px">
      <div class="card reveal"><div class="ico">${I.hub}</div><h3>Maha Solutions</h3><p>Connected software for hotels. <a href="/maha-hub-solutions">Learn more</a></p></div>
      <div class="card reveal"><div class="ico">${I.cap}</div><h3>Maha Academy</h3><p>Practical hospitality education. <a href="/maha-hub-academy">Learn more</a></p></div>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">What we believe</p><h2>The convictions we build on.</h2></div>
    <div class="grid g3">
      <div class="card reveal"><div class="ico">${I.people}</div><h3>People first</h3><p>Technology delivers value only when the team using it is confident. We pair every tool with learning.</p></div>
      <div class="card reveal"><div class="ico">${I.shield}</div><h3>Honest and careful</h3><p>We describe our products and programmes accurately, protect the data entrusted to us and never claim what we do not hold.</p></div>
      <div class="card reveal"><div class="ico">${I.hub}</div><h3>Built to connect</h3><p>Information should move seamlessly from one tool and one team to the next, never to be entered twice.</p></div>
    </div>
  </div>
</section>
<section class="section paper">
  <div class="wrap">
    <div class="sec-head reveal"><p class="eyebrow">Company details</p><h2>${COMPANY}</h2></div>
    <div class="prose reveal" style="max-width:820px"><table>
      <tr><th style="width:34%">Company</th><td>${COMPANY}</td></tr>
      <tr><th>Brands</th><td>Maha Solutions &middot; Maha Academy</td></tr>
      <tr><th>Registered address</th><td>${ADDRESS}</td></tr>
      <tr><th>Telephone</th><td><a href="tel:${PHONE_TEL}">${PHONE}</a></td></tr>
      <tr><th>Office</th><td>${OFFICE}<br>Tel <a href="tel:${OFFICE_TEL}">${OFFICE_PHONE}</a></td></tr>
      <tr><th>General enquiries</th><td><a href="mailto:${EMAIL}">${EMAIL}</a></td></tr>
      <tr><th>Customer support</th><td><a href="mailto:${SUPPORT}">${SUPPORT}</a></td></tr>
      <tr><th>Website</th><td>maha-hub.com</td></tr>
    </table></div>
  </div>
</section>
${ctaBand()}`);

/* ===================================================== SOLUTIONS ===================================================== */
add('maha-hub-solutions.html', 'solutions', {
  title: 'Maha Solutions | Connected software for hotels',
  desc: 'Maha Solutions: connected software for hotels. Maha PMS is available today, with Connect, Booking, Reach, Sales and Travel in development.',
  canon: '/maha-hub-solutions',
}, `${pageHero({ crumb: 'Maha Solutions', eyebrow: 'Technology', h1: 'Maha Solutions', shot: ['pms-dashboard','pms-grid','pms-housekeeping'], actions: true, lead: 'Connected software for hotels and accommodation businesses. Every product draws on the same hotel data, so that no team ever enters the same detail twice.', img: '/assets/hero-solutions.webp', pos: '50% 72%', cls: 'ph-light' })}
<section class="section">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">One booking, followed through every department</p><h2>Information flows from one product to the next.</h2><p class="lead">This is how a single guest booking is designed to travel through Maha Solutions, from first discovery to follow-up. Maha PMS is available today; the other stages arrive as each product is released.</p></div>
    <div class="section dark" style="border-radius:24px;padding:48px 24px 52px">
      <div class="steps">
        <div class="step reveal"><b>Guest finds you</b><span>Maha Reach</span></div>
        <div class="step reveal"><b>Guest books</b><span>Maha Booking or a channel via Maha Connect</span></div>
        <div class="step reveal"><b>Reservation arrives</b><span>Maha PMS</span></div>
        <div class="step reveal"><b>Stay and billing</b><span>Maha PMS: front office, folio, housekeeping</span></div>
        <div class="step reveal"><b>Follow up</b><span>Maha Reach and Maha Sales</span></div>
      </div>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="wrap">
    <div class="sec-head reveal"><p class="eyebrow">Who it is for</p><h2>Solutions for every kind of hotel.</h2><p class="lead">From a single independent property to a group of hotels, the same products grow with you.</p></div>
    <div class="grid g3">
      <div class="card reveal"><h3>Independent hotels</h3><p>Run the front office, reservations, housekeeping and billing from one system, with direct booking on your own website planned through Maha Booking.</p></div>
      <div class="card reveal"><h3>Resorts</h3><p>Bring rooms, guests and folios together in Maha PMS, with food and beverage and inventory planned to connect to the same data.</p></div>
      <div class="card reveal"><h3>Boutique hotels</h3><p>An uncluttered workspace for small teams, with direct booking and channel management planned to champion your own brand.</p></div>
      <div class="card reveal"><h3>Serviced apartments</h3><p>Manage units, stays, guests and billing in one place, from short visits to extended stays.</p></div>
      <div class="card reveal"><h3>Hotel groups</h3><p>Give each property its own workspace while keeping data organised under one group, with user roles per team.</p></div>
      <div class="card reveal"><h3>Multi-property operators</h3><p>Use the multi-property capability of Maha PMS, with management reporting planned in Maha Manage.</p></div>
    </div>
  </div>
</section>
<section class="section paper">
  <div class="wrap">
    <div class="sec-head reveal"><p class="eyebrow">Products</p><h2>Our products.</h2><p class="lead">Maha PMS is available today. Every other product is in development and not yet available.</p></div>
    <div class="grid g3">
      ${PRODUCTS.filter(p => p.live || DEV.includes(p.id)).map(p => prodCard(p, false)).join('')}
      ${moreCard}
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap grid g3">
    <div class="card reveal"><div class="ico">${I.shield}</div><h3>Secure by design</h3><p>Each hotel's data is reachable only by the people that hotel authorises. <a href="/security">Read about security</a>.</p></div>
    <div class="card reveal"><div class="ico">${I.key}</div><h3>Opened for your hotel</h3><p>Every product is activated for a hotel individually. Nothing is enabled by default.</p></div>
    <div class="card reveal"><div class="ico">${I.life}</div><h3>Onboarding and support</h3><p>We guide you through onboarding and remain available long after. <a href="/pricing">See how buying works</a>.</p></div>
  </div>
</section>
${ctaBand('Find the right configuration for your property.', 'Tell us about your hotel and we will recommend the best place to begin.', '<a class="btn btn-line" href="/solutions">Sign in</a>')}`);

/* ===================================================== PRODUCTS ===================================================== */
const PSHOT = { pms: ['pms-dashboard','pms-status','pms-grid','pms-housekeeping'] };
const deviceFrame = id => PSHOT[id] ? laptop(PSHOT[id]) : '';
const prodBlock = (p, i) => `<article class="split ${i % 2 ? 'rev' : ''}" id="${p.id}" style="padding:44px 0;border-top:1px solid var(--line)">
  <div class="reveal"><span class="tag ${p.live ? 'on' : 'soon'}">${p.live ? 'Available now' : 'In development'}</span>
    <h2 style="font-size:clamp(28px,3vw,40px)">${p.name}</h2><p class="kind" style="color:var(--gold3);font-weight:600;margin:-4px 0 12px">${p.kind}</p>
    <p class="lead" style="font-size:18px">${p.long}</p>
    ${p.live ? '' : '<p class="note">This product is in development and is not yet available.</p>'}
    <div class="hero-cta" style="margin-top:18px">${p.live
      ? `<button class="btn btn-green" type="button" data-book="demo">Book a Demo</button><a class="btn btn-line-dark" href="/solutions">Sign in</a>`
      : `<a class="btn btn-line-dark" href="/contact?interest=${encodeURIComponent(p.name + ' (in development)')}">Register interest</a>${p.id === 'travel' ? '<a class="btn btn-green" href="/maha-travel">Learn more</a>' : ''}`}</div></div>
  <div class="reveal"><div class="card"><h4 style="margin-bottom:14px">What it covers</h4><ul class="ticks" style="margin:0;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${p.features.map(f => `<li>${f}</li>`).join('')}</ul></div>${deviceFrame(p.id)}</div>
</article>`;
add('products.html', 'solutions', {
  title: 'Products | Maha Solutions', desc: 'Maha PMS is available today. Maha Connect, Booking, Reach, Sales and Travel, with Maha HR, Account, Manage, POS and Stock, are in development.', canon: '/products',
}, `${pageHero({ crumb: '<a href="/maha-hub-solutions">Maha Solutions</a> / Products', eyebrow: 'Maha Solutions', h1: 'Products', shot: ['pms-dashboard','pms-grid','pms-housekeeping','pms-status'], lead: 'Maha PMS is available today and is opened for your hotel individually. Every other product is in development and not yet available.', img: '/assets/banners/heritage.jpg', pos: '50% 35%' })}
<section class="section"><div class="wrap">
  ${LIVE.map(prodBlock).join('\n  ')}
  <div id="soon" class="sec-head reveal" style="margin-top:64px"><p class="eyebrow">In development</p><h2>Products in development.</h2><p class="lead">These products are in development and are not yet available.</p></div>
  ${SOON.map((p, i) => prodBlock(p, i)).join('\n  ')}
</div></section>
${ctaBand('Unsure which product suits you?', 'Tell us about your property and we will recommend the best place to begin.')}`);

/* ===================================================== PRICING ===================================================== */
add('pricing.html', 'solutions', {
  title: 'Pricing | Maha Solutions', desc: 'Flexible plans for single properties, multi-property operators and hotel groups. Contact us for a quote.', canon: '/pricing',
}, `${pageHero({ crumb: '<a href="/maha-hub-solutions">Maha Solutions</a> / Pricing', eyebrow: 'Maha Solutions', h1: 'Pricing', lead: 'Flexible plans for every kind of hospitality business. Every price is tailored to your property.', img: '/assets/banners/heritage.jpg', pos: '50% 60%' })}
<section class="section"><div class="wrap">
  <div class="grid g3">
    <div class="card reveal"><h3>Single property</h3><p class="note" style="margin-bottom:14px">For independent hotels, boutique hotels and serviced apartments.</p><div class="num" style="font-size:30px;color:var(--gold3);margin-bottom:12px">Contact for pricing</div><ul class="ticks" style="margin:0 0 22px"><li>Maha PMS</li><li>Maha Connect (in development)</li><li>Maha Booking (in development)</li><li>Maha Reach (in development)</li><li>Onboarding and support</li></ul><a class="btn btn-green" href="/contact?interest=Pricing%3A%20single%20property">Request a quote</a></div>
    <div class="card reveal"><h3>Multi-property</h3><p class="note" style="margin-bottom:14px">For operators managing more than one property.</p><div style="font-size:30px;color:var(--gold3);margin-bottom:12px">Contact for pricing</div><ul class="ticks" style="margin:0 0 22px"><li>Everything in the Single property plan</li><li>Several properties under one account</li><li>Onboarding and support</li></ul><a class="btn btn-green" href="/contact?interest=Pricing%3A%20multi-property">Talk to us</a></div>
    <div class="card reveal"><h3>Hotel groups</h3><p class="note" style="margin-bottom:14px">For hotel groups and hospitality companies with custom needs.</p><div style="font-size:30px;color:var(--gold3);margin-bottom:12px">Contact for pricing</div><ul class="ticks" style="margin:0 0 22px"><li>A tailored set of Maha products</li><li>Group onboarding</li><li>First access to products coming soon</li></ul><a class="btn btn-green" href="/contact?interest=Pricing%3A%20hotel%20group">Request a demo</a></div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="sec-head reveal"><p class="eyebrow">Buying</p><h2>How buying Maha works.</h2></div>
  <div class="grid g2">
    <div class="card reveal"><h3>What you pay for</h3><p>Access to Maha software by subscription, together with any related digital hospitality services agreed in your quotation, such as onboarding.</p></div>
    <div class="card reveal"><h3>Your quote</h3><p>Prices depend on your property type, size and the products you choose. Your quotation confirms the plan, billing period and currency before you pay.</p></div>
    <div class="card reveal"><h3>Payment</h3><p>Payments are processed securely by a third-party payment provider. We do not store full card numbers.</p></div>
    <div class="card reveal"><h3>Changes and cancellation</h3><p>You can cancel at the end of a billing period. See our <a href="/refund">Refund and Cancellation Policy</a> and <a href="/terms">Terms of Service</a>.</p></div>
  </div>
</div></section>
${ctaBand('Request a quotation.', 'Tell us about your property and the products you need.')}`);

/* ===================================================== MAHA TRAVEL ===================================================== */
add('maha-travel.html', 'solutions', {
  title: 'Maha Travel | Our own online travel agency, in development',
  desc: 'Maha Travel is the Maha Hub online travel agency, designed to connect guests directly with Maha hotels. In development and not yet available.',
  canon: '/maha-travel',
}, `${pageHero({ crumb: '<a href="/maha-hub-solutions">Maha Solutions</a> / Maha Travel', eyebrow: 'Maha Solutions &middot; In development', h1: 'Maha Travel', lead: 'Our own online travel agency, designed to bring guests and Maha hotels together directly. Maha Travel is in development and is not yet available.', actions: false })}
<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <p class="eyebrow">Our own channel</p>
      <h2>A travel channel built with hotels, for hotels.</h2>
      <p class="lead">Maha Travel will give guests a refined way to discover and book Maha hotels, and give hotels a channel they are part of rather than one they simply pay.</p>
      <p>It is designed to sit at the front of the Maha platform: reservations arrive directly in Maha PMS, and rates and availability stay aligned through Maha Connect. We will share dates and details here as they are confirmed.</p>
      <div class="hero-cta"><a class="btn btn-green" href="/contact?interest=Maha%20Travel%20(in%20development)">Register interest ${I.arr}</a><button class="btn btn-line-dark" type="button" data-book="talk">Talk with the Team</button></div>
    </div>
    <div class="grid" style="gap:16px">
      <div class="card reveal"><span class="tag soon">In development</span><h3>Planned for guests</h3><ul class="ticks" style="margin:10px 0 0"><li>Discover and compare Maha hotels in one place</li><li>Book directly, with clear rates and conditions</li><li>A consistent, considered experience from search to stay</li></ul></div>
      <div class="card reveal"><span class="tag soon">In development</span><h3>Planned for hotels</h3><ul class="ticks" style="margin:10px 0 0"><li>A distribution channel of your own group</li><li>Reservations delivered straight into Maha PMS</li><li>Rates and availability kept in step through Maha Connect</li></ul></div>
    </div>
  </div>
</section>
<section class="section dark">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">How it will fit</p><h2>From discovery to arrival, in one connected flow.</h2><p class="lead">This is the journey Maha Travel is designed to support. Maha PMS is available today; the other stages arrive as each product is released.</p></div>
    <div class="steps">
      <div class="step reveal"><b>Guest discovers</b><span>Maha Travel</span></div>
      <div class="step reveal"><b>Guest books</b><span>Maha Travel</span></div>
      <div class="step reveal"><b>Reservation arrives</b><span>Maha PMS</span></div>
      <div class="step reveal"><b>Rates stay aligned</b><span>Maha Connect</span></div>
      <div class="step reveal"><b>Stay and follow-up</b><span>Maha PMS and Maha Reach</span></div>
    </div>
  </div>
</section>
${ctaBand('Be among the first partner hotels.', 'Tell us about your hotel and we will keep you informed as Maha Travel takes shape.', '', ['/contact?interest=Maha%20Travel%20(in%20development)', 'Register interest'])}`);

/* ===================================================== SECURITY and legal ===================================================== */
const docPage = (file, active, crumb, title, lede, partial, canon, img = '/assets/maha-hub-hero.jpg') => add(file, active, { title: `${title} | Maha Hub`, desc: lede, canon },
  `${pageHero({ crumb, h1: title, lead: lede, img, pos: '48% 50%' })}\n${partial}\n${ctaBand('Questions?', 'We are happy to explain anything on this page.')}`);
docPage('security.html', 'solutions', '<a href="/maha-hub-solutions">Maha Solutions</a> / Security', 'Data security',
  'How Maha Hub protects hotel and guest data: our principles, safeguards, providers and commitments.',
  content('security.html').replace(/<p class="img-credit">.*?<\/p>/s, ''), '/security');
docPage('privacy.html', '', 'Privacy Policy', 'Privacy Policy', `How ${COMPANY} collects, uses, shares and protects personal data, and the rights you have.`, content('privacy.html'), '/privacy');
docPage('terms.html', '', 'Terms of Service', 'Terms of Service', 'The terms for using Maha Hub software and services.', content('terms.html'), '/terms');
docPage('refund.html', '', 'Refund Policy', 'Refund and Cancellation Policy', 'How cancellation and refunds work for Maha Solutions subscriptions.', content('refund.html'), '/refund');

/* ===================================================== ACADEMY ===================================================== */
add('maha-hub-academy.html', 'academy', {
  title: 'Maha Academy | Practical education for hospitality',
  desc: 'Maha Academy: practical hospitality education for people starting a career, hotel teams and managers. Programmes opening soon.', canon: '/maha-hub-academy',
}, `${pageHero({ crumb: 'Maha Academy', eyebrow: 'Education', h1: 'Maha Academy', actions: false, lead: 'Practical hospitality education for those beginning a career, for established hotel teams and for managers. Programmes open soon.', img: '/assets/hero-academy.webp', pos: '50% 42%', cls: 'ph-light' })}
<section class="section">
  <div class="wrap split">
    <div class="reveal">
      <p class="eyebrow">Our approach</p>
      <h2>Learning grounded in real hotel work.</h2>
      <p class="lead">Hotels are run by people, and well-prepared people make every guest feel genuinely cared for. The Academy is being built to teach what hotels truly need.</p>
      <ul class="ticks"><li>Practical and hands-on, never theory alone</li><li>Standards that reflect how modern hotels operate</li><li>Training on the tools hotels use, including Maha PMS</li><li>A clear path from first role to team leader to manager</li></ul>
      <p class="note">Programme details, dates and fees will be published here when they are confirmed.</p>
    </div>
    <div class="frame reveal"><img src="/assets/banners/heritage.jpg" alt="A traditional temple roof above a garden with hot air balloons in the sky" loading="lazy" width="1228" height="720"></div>
  </div>
</section>
<section class="section alt">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">Learning areas</p><h2>What we plan to teach.</h2></div>
    <div class="grid g3">
      <div class="card reveal"><div class="ico">${I.bell}</div><h3>Front office</h3><p>Reservations, arrivals and departures, billing and guest service, delivered with poise at the front desk.</p></div>
      <div class="card reveal"><div class="ico">${I.broom}</div><h3>Housekeeping</h3><p>Room standards, cleaning routines and close coordination with the front desk.</p></div>
      <div class="card reveal"><div class="ico">${I.cup}</div><h3>Food and beverage service</h3><p>Service standards, guest care and the fundamentals of running an outlet.</p></div>
      <div class="card reveal"><div class="ico">${I.chart}</div><h3>Hotel management and leadership</h3><p>Leading a team, controlling cost and growing revenue with confidence.</p></div>
      <div class="card reveal"><div class="ico">${I.chat}</div><h3>Guest service and communication</h3><p>Attentive listening, problem solving and genuine care for every guest.</p></div>
      <div class="card reveal"><div class="ico">${I.screen}</div><h3>Hotel technology</h3><p>Mastering modern hotel systems with confidence, including training on Maha PMS.</p></div>
    </div>
  </div>
</section>
<section class="section paper">
  <div class="wrap">
    <div class="sec-head center reveal"><p class="eyebrow">Who it is for</p><h2>For every stage of a hospitality career.</h2></div>
    <div class="grid g3">
      <div class="card reveal"><div class="ico">${I.cap}</div><h3>Career starters</h3><p>School leavers and graduates seeking a strong start in hotels.</p></div>
      <div class="card reveal"><div class="ico">${I.people}</div><h3>Hotel teams</h3><p>Front-line staff who wish to strengthen their skills and confidence together.</p></div>
      <div class="card reveal"><div class="ico">${I.chart}</div><h3>Managers and owners</h3><p>Leaders who seek stronger systems, higher standards and better results.</p></div>
    </div>
  </div>
</section>
${ctaBand('Be among the first to hear about our programmes.', 'Register your interest and tell us what you would like to learn. We will write to you as soon as programmes open.', '<a class="btn btn-line" href="/contact">Contact us</a>', ['/contact?interest=Maha%20Hub%20Academy', 'Register interest'])}`);

/* ===================================================== CONTACT ===================================================== */
add('contact.html', 'contact', {
  title: 'Contact | Maha Hub Group of Companies', desc: 'Contact Maha Hub Group of Companies: ask about Maha Solutions, request a demo, get a quote or register interest in Maha Academy.', canon: '/contact',
}, `${pageHero({ crumb: 'Contact', eyebrow: 'Contact', h1: 'Speak with Maha Hub.', actions: true, lead: 'Enquire about Maha Solutions, request a demonstration, ask for a quotation, or register your interest in Maha Academy.', img: '/assets/maha-hub-hero.jpg', pos: '60% 60%' })}
<section class="section"><div class="wrap contact-grid">
  <form class="form reveal" id="contact-form" novalidate>
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" required><span class="err">Enter your name.</span></div>
    <div class="field"><label for="f-business">Business / hotel / school</label><input id="f-business" name="business" autocomplete="organization" required><span class="err">Enter your business or hotel name.</span></div>
    <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required><span class="err">Enter a valid email address.</span></div>
    <div class="field"><label for="f-phone">Phone <i>(optional)</i></label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
    <div class="field"><label for="f-country">Country</label><input id="f-country" name="country" autocomplete="country-name" required><span class="err">Enter your country.</span></div>
    <div class="field"><label for="f-interest">Interested in <i>(optional)</i></label><select id="f-interest" name="interest">
      <option value="">Choose a topic</option>
      <optgroup label="Maha Solutions">${LIVE.map(p => `<option>${p.name}</option>`).join('')}${SOON.map(p => `<option>${p.name} (in development)</option>`).join('')}<option>Pricing: single property</option><option>Pricing: multi-property</option><option>Pricing: hotel group</option></optgroup>
      <optgroup label="Maha Academy"><option>Maha Academy</option></optgroup>
      <optgroup label="Other"><option>Partnership</option><option>Something else</option></optgroup>
    </select></div>
    <div class="field full"><label for="f-message">Message</label><textarea id="f-message" name="message" required></textarea><span class="err">Tell us how we can help.</span></div>
    <div class="field full"><button class="btn btn-green" type="submit">Send message ${I.arr}</button></div>
    <p class="note" style="grid-column:1/-1">Sending opens your email app with your message ready to send to ${EMAIL}.</p>
    <div class="form-done" role="status">Your email app should now be open with your message. Press send there to reach us. If it did not open, email us at <a href="mailto:${EMAIL}">${EMAIL}</a>.</div>
  </form>
  <aside class="reveal">
    <ul class="info-list">
      <li>${I.mail}<div><b>General enquiries</b><a href="mailto:${EMAIL}">${EMAIL}</a></div></li>
      <li>${I.life}<div><b>Customer support</b><a href="mailto:${SUPPORT}">${SUPPORT}</a></div></li>
      <li>${I.key}<div><b>Existing customers</b>Sign in at <a href="/solutions">maha-hub.com/solutions</a> and use Contact Support, or email us.</div></li>
      <li>${I.globe}<div><b>Registered office</b>${ADDRESS}</div></li>
      <li>${I.life}<div><b>Telephone</b><a href="tel:${PHONE_TEL}">${PHONE}</a></div></li>
      <li>${I.globe}<div><b>Office</b>${OFFICE}<br>Tel <a href="tel:${OFFICE_TEL}">${OFFICE_PHONE}</a></div></li>
      <li>${I.globe}<div><b>Website</b>maha-hub.com</div></li>
    </ul>
    <p class="note" style="margin-top:26px">Billing questions: see the <a href="/refund">Refund and Cancellation Policy</a>, or email us with your business name.</p>
  </aside>
</div></section>`);

/* ===================================================== PASSWORD PAGE (keeps its working script) ===================================================== */
add('reset-password.html', '', { title: 'Set your password | Maha Hub', desc: 'Set a new password for your Maha Hub sign-in.', canon: '/reset-password.html', noindex: true },
  `<section class="section alt"><div class="wrap" style="max-width:560px">
  <h1 id="rp-title" style="font-size:clamp(32px,4vw,46px)">Set your password</h1>
  <p id="rp-loading" role="status">Checking your link...</p>
  <div id="rp-bad" style="display:none">
    <p id="rp-bad-text">This link is not valid any more.</p>
    <p>Links work once and expire after a short time. Ask Maha Hub support to send you a new one: <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>
  </div>
  <form class="form" id="rp-form" novalidate style="display:none">
    <p id="rp-who" class="note" style="grid-column:1/-1"></p>
    <div class="field full"><label for="rp-new">New password</label>
      <input id="rp-new" type="password" autocomplete="new-password" required>
      <span class="err" id="rp-new-err">Use at least 6 characters, with one capital letter, one small letter, one special character and two numbers.</span></div>
    <div class="field full"><label for="rp-again">Type it again</label>
      <input id="rp-again" type="password" autocomplete="new-password" required>
      <span class="err" id="rp-again-err">The two passwords are not the same.</span></div>
    <div class="field full"><span class="err" id="rp-send-err" style="display:none"></span></div>
    <div class="field full"><button class="btn btn-green" type="submit" id="rp-go">Save password</button></div>
    <p class="note" style="grid-column:1/-1">Your password is never shown to anyone at Maha Hub. Do not share it.</p>
  </form>
  <div class="form-done" id="rp-done" role="status">Your password is saved. You can now <a href="/solutions">sign in</a> with your username and the new password.</div>
</div></section>
${content('reset-password.script.html')}`);

/* ===================================================== 404 ===================================================== */
add('404.html', '', { title: 'Page not found | Maha Hub', desc: 'This page could not be found.', canon: '/404.html', noindex: true },
  `<section class="nf"><div class="wrap">
  <img src="/brand/pms/lockup.png" alt="" width="150">
  <h1 style="font-size:clamp(36px,5vw,56px)">We could not find that page.</h1>
  <p class="lead" style="margin-inline:auto">The link may be old or mistyped. Try one of these instead.</p>
  <div class="hero-cta" style="justify-content:center"><a class="btn btn-green" href="/">Home</a><a class="btn btn-line-dark" href="/maha-hub-solutions">Maha Solutions</a><a class="btn btn-line-dark" href="/maha-hub-academy">Maha Academy</a><a class="btn btn-line-dark" href="/solutions">Sign in</a></div>
</div></section>
<script>
/* the PMS address is /solutions-PMS; accept it in any letter case */
(function(){var p=location.pathname.replace(/\\/+$/,'').toLowerCase();if(p==='/solutions-pms'){location.replace('/solutions-PMS'+location.search+location.hash)}else if(p==='/solutions'||p==='/ecosystem'){location.replace('/solutions'+location.search+location.hash)}})();
</script>`);

/* ===================================================== write everything ===================================================== */
for (const [file, html] of Object.entries(pages)) fs.writeFileSync(path.join(ROOT, file), html, 'utf8');
/* one 404 for every Maha address: the explorer page (errors/unplugged.html) is also the website's 404.html */
fs.copyFileSync(path.join(ROOT, 'errors', 'unplugged.html'), path.join(ROOT, '404.html'));

const urls = ['/', '/about', '/maha-hub-solutions', '/products', '/maha-travel', '/pricing', '/security', '/maha-hub-academy', '/contact', '/privacy', '/terms', '/refund', '/solutions'];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${SITE}${u === '/' ? '/' : u}</loc></url>`).join('')}</urlset>\n`, 'utf8');
console.log('built ' + Object.keys(pages).length + ' pages');
