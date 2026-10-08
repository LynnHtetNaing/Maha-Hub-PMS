"""Maha Hub website builder.

Edit the SETTINGS and PRODUCTS below, then run:  python3 build.py
Every page is regenerated into ./site with the same header, footer and styling.
"""
import math, os, html, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hero_art import hero_art, hero_water

# =========================== SETTINGS ===========================
SITE = "https://maha-hub.com"
EMAIL = "hello@maha-hub.com"
SUPPORT_EMAIL = "support@maha-hub.com"   # PMS support (existing customers)
LOGO = "https://maha-hub.com/icons/maha-hub-logo.png"
SIGN_IN = "https://maha-hub.com/ecosystem/"
APP = "https://maha-hub.com/ecosystem/"     # live product apps: APP + "PMS", "Booking", "Connect", "Reach"
HERO = "assets/maha-hub-hero.jpg"
HERO_SM = "assets/maha-hub-hero-sm.jpg"
UPDATED = "8 October 2026"

OPERATOR = "Padauk Hospitality Technology and Academy"
MARK = "https://maha-hub.com/icons/maha-mark-sq.png"
APP_ICON = "https://maha-hub.com/icons/icon-512.png"
# Company details for the legal pages. Fill these in before going live / Stripe review.
# While a value starts with "[", it is highlighted on the page so it is easy to spot.
LEGAL_NAME = "Padauk Hospitality Technology and Academy"
LEGAL_ADDRESS = "[To be added]"
LEGAL_COUNTRY = "[Country of registration]"
GOVERNING_LAW = "[To be added]"

# Pricing: leave "" to show "Contact for pricing"; e.g. "From 1,500 THB / month"
PRICES = {"single": "", "multi": "", "group": ""}
# ================================================================

LIVE, DEV = "live", "dev"
PRODUCTS_RAW = [
    dict(id="pms", name="Maha PMS", kind="Property management system", status=LIVE, app="PMS", grad=("#1F6D58", "#134536"),
         line="Manage your property, rooms, rates and reservations.",
         desc="The core of the Maha ecosystem: property, rooms, rates, reservations, front office and billing in one connected workspace.",
         caps=["Property and rooms", "Rates", "Reservations", "Front office", "Folio and billing", "Guest profiles", "Housekeeping", "Reports", "User roles"]),
    dict(id="connect", name="Maha Connect", kind="Channel distribution", status=LIVE, app="Connect", grad=("#2A5F88", "#16384F"),
         line="Distribute your inventory across global channels.",
         desc="Channel distribution for your hotel, keeping your rooms and rates in step across the channels you sell on.",
         caps=["Inventory distribution", "Rates across channels", "Connected to Maha PMS"]),
    dict(id="booking", name="Maha Booking", kind="Direct booking", status=LIVE, app="Booking", grad=("#9A7128", "#5A3D12"),
         line="Let guests book directly on your website.",
         desc="A direct booking engine for your own website, so guests can reserve with you instead of through a third party.",
         caps=["Direct bookings on your website", "Rooms and rates from Maha PMS", "Reservations created in Maha PMS"]),
    dict(id="reach", name="Maha Reach", kind="Marketing and guest engagement", status=LIVE, app="Reach", grad=("#6A458F", "#3A2452"),
         line="Boost your brand with marketing and guest engagement.",
         desc="Marketing and guest engagement for hotels, so you can stay in touch with guests and grow your brand.",
         caps=["Marketing", "Campaigns", "Guest engagement"]),
    dict(id="hr", name="Maha HR", kind="People", status=DEV, line="Team, attendance and payroll.",
         desc="People management for hotel teams: team records, attendance and payroll.", caps=["Team", "Attendance", "Payroll"]),
    dict(id="account", name="Maha Account", kind="Finance", status=DEV, line="Accounting and finance.",
         desc="Accounting and finance for hotels.", caps=["Accounting", "Finance"]),
    dict(id="manage", name="Maha Manage", kind="Back office", status=DEV, line="Back office and multi-property.",
         desc="Back office tools and multi-property management.", caps=["Back office", "Multi-property"]),
    dict(id="pos", name="Maha POS", kind="Point of sale", status=DEV, line="F&B and retail point of sale.",
         desc="Point of sale for food and beverage outlets and retail.", caps=["Food and beverage", "Retail"]),
    dict(id="stock", name="Maha Stock", kind="Inventory", status=DEV, line="Inventory and suppliers.",
         desc="Inventory and supplier management for hotel stores and outlets.", caps=["Inventory", "Suppliers"]),
    dict(id="sales", name="Maha Sales", kind="Sales", status=LIVE, app="Sales", grad=("#1A6B62", "#0C3F3A"),
         line="Hotel leads, follow-ups and quotations.",
         desc="Leads, follow-ups and quotations for hotel sales teams, opened from the same Maha sign-in.",
         caps=["Leads", "Follow-ups", "Quotations"]),
]
ORDER = ["pms", "connect", "booking", "reach", "sales", "hr", "account", "manage", "pos", "stock"]
PRODUCTS = sorted(PRODUCTS_RAW, key=lambda p: ORDER.index(p["id"]))
P = {p["id"]: p for p in PRODUCTS}
STATUS = {LIVE: ("badge-live", "Available now"), DEV: ("badge-dev", "Coming soon")}

ORN = '<svg class="orn" viewBox="0 0 240 28" aria-hidden="true"><path d="M2 14h70M168 14h70" stroke="currentColor" stroke-width="1"/><path d="M72 14c9 0 13-9 22-9 7 0 9 7 3 9-5 2-8-3-4-5M168 14c-9 0-13-9-22-9-7 0-9 7-3 9 5 2 8-3 4-5M80 14c8 0 12 7 20 7 5 0 6-4 2-5M160 14c-8 0-12 7-20 7-5 0-6-4-2-5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M120 2c7 6 9 11 0 23-9-12-7-17 0-23z" fill="currentColor"/><circle cx="108" cy="14" r="1.6" fill="currentColor"/><circle cx="132" cy="14" r="1.6" fill="currentColor"/></svg>'
ICON = {
 "pms": '<path d="M3 18V7M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.8"/>',
 "connect": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
 "booking": '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2"/>',
 "reach": '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
 "sales": '<path d="M4 20h16"/><path d="M6 16v-3M10 16v-6M14 16v-4M18 16V7"/><path d="M5 9l5-4 4 3 5-4"/>',
 "pos": '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2.5 5-2 8h3V3zM17 11v10"/>',
 "stock": '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5L12 12l8-4.5M12 12v9"/>',
 "account": '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15h5M10 18h3"/>',
 "hr": '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
 "manage": '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7 16v-3M11 16V9M15 16v-5M7 8h2"/>',
}
def ico(k, cls="ico"):
    return f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[k]}</svg>'
ARROW = '<svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>'
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
esc = html.escape

def fill(v):
    return f'<span class="fill">{esc(v)}</span>' if v.startswith("[") else esc(v)

def badge(p):
    c, t = STATUS[p["status"]]
    return f'<span class="badge {c}">{t}</span>'

NAV = [("index.html", "Home"), ("products.html", "Products"), ("solutions.html", "Solutions"),
       ("about.html", "About Maha"), ("pricing.html", "Pricing"), ("security.html", "Security"), ("contact.html", "Contact")]

def page(fname, title, desc, body, current=None):
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h == (current or fname) else ""}>{t}</a>' for h, t in NAV)
    live = [p for p in PRODUCTS if p["status"] == LIVE]
    foot_products = "".join(f'<li><a href="products.html#{p["id"]}">{p["name"]}</a></li>' for p in live)
    full_title = "Maha Hub | Connected Hospitality Technology" if fname == "index.html" else f"{title} | Maha Hub"
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}/{'' if fname == 'index.html' else fname}">
<link rel="icon" type="image/png" href="{MARK}">
<link rel="apple-touch-icon" href="{APP_ICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Maha Hub">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{APP_ICON}">
<meta name="theme-color" content="#0A3020">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Serif:wght@500;600&family=Noto+Serif+Thai:wght@500;600&family=Noto+Serif+Myanmar:wght@500;600&family=Noto+Sans:wght@400;500;600&family=Noto+Sans+Thai:wght@400;600&family=Noto+Sans+Myanmar:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/styles.css">{'<link rel="preload" as="image" href="'+HERO+'">' if fname == "index.html" else ""}
</head>
<body class="{'is-home' if fname == 'index.html' else 'is-inner'}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-in">
    <a class="logo" href="index.html" aria-label="Maha Hub home">
      <img src="{MARK}" alt="" width="44" height="44" onerror="this.remove()">
      <span>MAHA HUB</span>
    </a>
    <nav class="nav" aria-label="Main">{nav}</nav>
    <div class="head-cta">
      <a class="signin" href="{SIGN_IN}">Sign in</a>
      <a class="btn btn-pill sm" href="contact.html">Get started {ARROW}</a>
    </div>
    <button class="menu-btn" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div>
</header>
<main id="main">
{body}
</main>
<footer class="site-foot">
  <div class="wrap foot-top">
    <div class="foot-brand">
      <div class="lockup">
        <img src="{LOGO}" alt="Maha Hub" width="101" height="72" onerror="this.parentNode.classList.add('no-img');this.remove()">
        <b>MAHA HUB</b>
        <div class="lockup-line">{ORN}</div>
      </div>
      <em>Connected Hospitality Technology.</em>
      <p>Smarter hospitality / Better tomorrow. One ecosystem for hotel operations: PMS, channel distribution, direct booking, guest engagement and sales.</p>
    </div>
    <div><h4>Products</h4><ul>{foot_products}<li><a href="products.html">All products</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="solutions.html">Solutions</a></li><li><a href="about.html">About</a></li><li><a href="pricing.html">Pricing</a></li><li><a href="security.html">Security</a></li><li><a href="contact.html">Contact</a></li></ul></div>
    <div><h4>Support</h4><ul><li><a href="mailto:{EMAIL}">{EMAIL}</a></li><li><a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a></li><li><a href="{SITE}">maha-hub.com</a></li><li><a href="{SIGN_IN}">Customer sign in</a></li></ul>
      <h4 style="margin-top:1.4rem">Legal</h4><ul><li><a href="privacy.html">Privacy Policy</a></li><li><a href="terms.html">Terms of Service</a></li><li><a href="refund.html">Refund Policy</a></li></ul></div>
  </div>
  <div class="foot-bottom wrap">
    <span>© <span data-year>2026</span> Maha Hub by {OPERATOR}. All rights reserved.</span>
    <span>Hospitality technology software for hotels, resorts and accommodation businesses.</span>
  </div>
</footer>
<script src="assets/site.js" defer></script>
</body>
</html>
'''

# ---------------- Ecosystem diagram (hero) ----------------
def ecosystem_svg():
    cx = cy = 260
    core = [p for p in PRODUCTS if p["status"] == LIVE]
    dev = [p for p in PRODUCTS if p["status"] == DEV]
    out = [f'<svg viewBox="0 0 520 520" role="img" aria-labelledby="eco-t"><title id="eco-t">The Maha ecosystem: Maha Hub at the centre, connected to available products and products in development</title>']
    out.append(f'<circle cx="{cx}" cy="{cy}" r="118" fill="none" stroke="rgba(232,176,88,.28)" stroke-width="1"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="212" fill="none" stroke="rgba(232,176,88,.16)" stroke-width="1" stroke-dasharray="2 6"/>')
    def node(p, r, ang, live, size):
        x = cx + r * math.cos(ang); y = cy + r * math.sin(ang)
        out.insert(3, f'<line class="spoke" x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}"/>' if live else
                   f'<line x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}" stroke="rgba(232,176,88,.14)" stroke-width="1"/>')
        label = p["name"].replace("Maha ", "")
        if live:
            out.append(f'<g><a href="products.html#{p["id"]}"><circle cx="{x:.1f}" cy="{y:.1f}" r="{size}" fill="{p["grad"][0]}" stroke="#D49A38" stroke-width="2"/>'
                       f'<text x="{x:.1f}" y="{y + 1:.1f}" text-anchor="middle" dominant-baseline="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="12.5" fill="#F7F3EA">{esc(label)}</text></a></g>')
        else:
            out.append(f'<g><circle cx="{x:.1f}" cy="{y:.1f}" r="{size}" fill="#0A3020" stroke="#E8B058" stroke-width="1.3" stroke-dasharray="3 3"/>'
                       f'<text x="{x:.1f}" y="{y + 1:.1f}" text-anchor="middle" dominant-baseline="middle" font-family="Noto Sans,sans-serif" font-size="10.5" fill="#cfdcd4">{esc(label)}</text></g>')
    for i, p in enumerate(core):
        step = (2 * math.pi / len(core)) if core else 0
        node(p, 118, -math.pi / 2 + i * step, True, 36 if len(core) > 4 else 40)
    for i, p in enumerate(dev):
        node(p, 212, -math.pi / 2 + math.pi / 6 + i * 2 * math.pi / len(dev), False, 33)
    out.append(f'<circle cx="{cx}" cy="{cy}" r="58" fill="#F7F3EA"/><circle cx="{cx}" cy="{cy}" r="58" fill="none" stroke="#D49A38" stroke-width="2"/>')
    out.append(f'<image href="{MARK}" x="{cx - 40}" y="{cy - 40}" width="80" height="80" preserveAspectRatio="xMidYMid meet"/>')
    out.append('</svg>')
    return "".join(out)

def card2(p):
    feats = "".join(f"<li>{esc(c)}</li>" for c in p["caps"][:6])
    g = p["grad"]
    return f'''<article class="card2" style="--pc:{g[0]};--pc2:{g[1]}" data-reveal>
  <span class="card2-ic">{ico(p["id"])}</span>
  <h3><a href="products.html#{p["id"]}">{esc(p["name"])}</a></h3>
  <p class="card2-kind">{esc(p["kind"])}</p>
  <span class="card2-tag">Available now</span>
  <ul>{feats}</ul>
  <div class="card2-foot"><a class="btn btn-pill-line sm" href="products.html#{p["id"]}">Learn more {ARROW}</a></div>
</article>'''

def soon2(p):
    return f'''<a class="soon2" href="products.html#{p["id"]}"><span class="ic">{ico(p["id"])}</span><b>{esc(p["name"])}</b><span>{esc(p["line"])}</span><em>Coming soon</em></a>'''

def prod_card(p):
    caps = "".join(f"<li>{esc(c)}</li>" for c in p["caps"][:4])
    g = p.get("grad")
    style = f' style="--g1:{g[0]};--g2:{g[1]}"' if g else ""
    signin = f'<a class="more" href="{APP}{p["app"]}">Sign in</a>' if p["status"] == LIVE else ""
    return f'''<article class="prod{' dev' if p['status'] == DEV else ' live'}"{style} data-reveal>
  <div class="prod-top"><h3><a href="products.html#{p['id']}">{esc(p['name'])}</a></h3>{badge(p)}</div>
  <p>{esc(p['line'])}</p>
  <ul class="mini">{caps}</ul>
  <div class="prod-links"><a class="more" href="products.html#{p['id']}">Learn more</a>{signin}</div>
</article>'''

SOL_ICONS = {
 "independent": '<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>',
 "resort": '<path d="M3 20h18"/><path d="M12 20V9"/><path d="M12 9c-3-4-7-3-8-1 3 0 5 1 8 1zM12 9c3-4 7-3 8-1-3 0-5 1-8 1z"/>',
 "boutique": '<path d="M5 20V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20v-4h4v4"/>',
 "apartment": '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h3M13 7h3M8 11h3M13 11h3M8 15h3M13 15h3"/>',
 "group": '<path d="M3 20V10l5-3 5 3v10"/><path d="M13 20V6l4-2 4 2v14"/><path d="M3 20h18"/>',
 "multi": '<circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="6" r="2"/><circle cx="19.5" cy="6" r="2"/><circle cx="4.5" cy="18" r="2"/><circle cx="19.5" cy="18" r="2"/><path d="M6.2 7.2l3.4 2.9M17.8 7.2l-3.4 2.9M6.2 16.8l3.4-2.9M17.8 16.8l-3.4-2.9"/>',
}
SOLUTIONS = [
 ("independent", "Independent hotels", "Run the front office, reservations, housekeeping and billing from one system, and take direct bookings on your own website."),
 ("resort", "Resorts", "Bring rooms, guests and folios together in Maha PMS, with F&B point of sale and inventory planned to connect into the same data."),
 ("boutique", "Boutique hotels", "A clear, simple workspace for small teams, with direct booking and channel management to support your own brand."),
 ("apartment", "Serviced apartments", "Manage units, stays, guests and billing in one place, from short stays to longer ones."),
 ("group", "Hotel groups", "Give each property its own workspace while keeping data organised in one ecosystem, with user roles per team."),
 ("multi", "Multi-property operators", "Use Maha PMS multi-property capability to manage several properties, with management reporting planned in Maha Manage."),
]

def sol_block():
    return "".join(f'''<div class="sol"><h3><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">{SOL_ICONS[k]}</svg></i>{t}</h3><p>{d}</p></div>''' for k, t, d in SOLUTIONS)

SCALE = '''<div class="scale">
  <div><b>One property</b><span>Start with Maha PMS and add the Booking Engine and Connect when you are ready.</span></div>
  <div><b>Several properties</b><span>Run more than one property with multi-property capability and shared standards.</span></div>
  <div><b>A hotel group</b><span>Grow into group-level management as more Maha products become available.</span></div>
</div>'''

WORKFLOW = [
 ("start", "Guest books", ""),
 ("sys", "Maha Booking", "booking"),
 ("sys", "Maha PMS", "pms"),
 ("data", "Room and reservation data", ""),
 ("sys", "Maha POS", "pos"),
 ("data", "Charges to the guest folio", ""),
 ("sys", "Maha Stock", "stock"),
 ("data", "Inventory consumption", ""),
 ("sys", "Maha Account", "account"),
 ("data", "Financial records", ""),
 ("sys", "Maha Manage", "manage"),
 ("data", "Back office and multi-property insights", ""),
]
def workflow():
    li = []
    for kind, label, pid in WORKFLOW:
        sub = ""
        if pid:
            sub = f'<small>{"Available now" if P[pid]["status"] == LIVE else "Coming soon"}</small>'
        lab = f'<a href="products.html#{pid}"><b>{esc(label)}</b></a>' if pid else f'<b>{esc(label)}</b>'
        li.append(f'<li class="step {kind}"><span class="node"></span><div class="card">{lab}{sub}</div></li>')
    return '<ol class="flow">' + "".join(li) + '</ol>'

# =========================== PAGES ===========================
def home():
    live = [P[i] for i in ["connect", "booking", "reach"]]
    dev = [p for p in PRODUCTS if p["status"] == DEV]
    pms = P["pms"]
    feats = "".join(f"<li>{CHECK}{esc(c)}</li>" for c in pms["caps"])
    chain = [("Maha PMS", "pms"), ("Connect", "connect"), ("Booking", "booking"), ("Reach", "reach"), ("Sales", "sales"), ("POS", "pos"),
             ("Stock", "stock"), ("Account", "account"), ("HR", "hr"), ("Manage", "manage")]
    chain_li = "".join(f'<li class="{"dev" if P[i]["status"] == DEV else ""}"><a href="products.html#{i}">{t}</a>{"<small>Coming soon</small>" if P[i]["status"] == DEV else ""}</li>' for t, i in chain)
    scattered = "".join(f"<span>{s}</span>" for s in ["PMS", "Booking engine", "Channel manager", "Sales", "POS", "Inventory", "Accounting", "HR", "Revenue", "Marketing"])
    body = f'''
<section class="hero-live" aria-label="Maha Hub">
  <div class="hl-media" aria-hidden="true">
    <div class="hl-stage">
      <img src="{HERO}" srcset="{HERO_SM} 960w, {HERO} 1671w" sizes="100vw" alt="" fetchpriority="high">
      {hero_water()}
      <div class="hl-tint"></div><div class="hl-suncover"></div>
      {hero_art()}<div class="hl-moon"></div><div class="hl-moonpath"></div>
      <div class="hl-shimmer"></div>
      <div class="hl-glow g1"></div><div class="hl-glow g2"></div><div class="hl-glow g3"></div><div class="hl-glow g4"></div><div class="hl-glow g5"></div>
      <div class="hl-stars"></div><div class="hl-flies"></div><div class="hl-birds"><i></i><i></i><i></i></div>
    </div>
    <div class="hl-shade"></div>
  </div>
  <div class="wrap hl-content">
    <div class="lockup hero-lockup">
      <h1 class="hero-brand-row"><img class="hero-mark" src="{MARK}" alt="" onerror="this.remove()"><span class="line"><span>MAHA HUB</span></span></h1>
      <p class="hero-sub hl-fade">Connected Hospitality Technology</p>
      <div class="hl-orn lockup-line">{ORN}</div>
    </div>
    <p class="lede hl-fade">One connected ecosystem for smarter hotel operations, commercial growth and hospitality management.</p>
    <div class="actions hl-fade">
      <a class="btn btn-pill" href="products.html">Explore Maha {ARROW}</a>
      <a class="btn btn-pill-line" href="contact.html">Contact Us</a>
    </div>
    <p class="hl-time hl-fade" aria-live="polite"><span class="hl-dot"></span><span id="hl-time-text">Live view</span></p>
  </div>
</section>

<section class="section why2" id="why">
  <img class="fade-art fa-right" src="assets/banners/golden.jpg" alt="" aria-hidden="true">
  <div class="wrap why2-grid">
    <div data-reveal>
      <p class="label">Why Maha</p>
      <div class="label-line">{ORN}</div>
      <h2>From disconnected systems to a unified ecosystem.</h2>
      <p class="why2-text">Hotels often use many separate systems for their daily operations. Maha brings everything together in one connected platform, so you can work smarter, save time and grow your business.</p>
      <a class="textlink" href="products.html">Explore products {ARROW}</a>
    </div>
    <div class="eco-card" data-reveal>
      <ul>{"".join(f'<li class="{"live" if P[i]["status"] == LIVE else "soon"}"><a href="products.html#{i}"><span class="ic">{ico(i)}</span>{P[i]["name"]}{"" if P[i]["status"] == LIVE else "<em>Coming soon</em>"}</a></li>' for i in ORDER)}</ul>
    </div>
    <div class="eco-tag" data-reveal><span class="tick"></span><p>One ecosystem.<br>Endless possibilities.</p></div>
  </div>
</section>

<section class="section prod2" id="products">
  <div class="wrap">
    <div class="prod2-head">
      <div data-reveal>
        <p class="label">Our products</p>
        <div class="label-line">{ORN}</div>
        <h2>Powerful tools for every part of your hospitality business.</h2>
      </div>
        <p class="prod2-intro" data-reveal>The Maha ecosystem connects hotel operations, distribution, direct booking, guest engagement and sales, with more products coming soon. Each product is opened for your hotel by Padauk.</p>
    </div>
    <div class="prod2-grid">
      <div class="live-cards">{"".join(card2(p) for p in PRODUCTS if p["status"] == LIVE)}</div>
      <div class="soon-wrap" data-reveal>
        <p class="soon-title">Coming soon</p>
        <div class="soon-cards">{"".join(soon2(p) for p in PRODUCTS if p["status"] == DEV)}</div>
      </div>
    </div>
  </div>
</section>

<section class="section sol2" id="solutions">
  <img class="fade-art fa-bottom" src="{HERO}" alt="" aria-hidden="true">
  <div class="wrap sol2-grid">
    <div data-reveal>
      <p class="label">Hotel solutions</p>
      <div class="label-line">{ORN}</div>
      <h2>Solutions for every hotel</h2>
      <p class="why2-text">From independent hotels to multi-property groups, Maha scales with your business.</p>
      <a class="textlink" href="solutions.html">See all solutions {ARROW}</a>
    </div>
    <ul class="sol2-icons" data-reveal>{"".join(f'<li><a href="solutions.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">{SOL_ICONS[k]}</svg><span>{t}</span></a></li>' for k, t, d in SOLUTIONS)}</ul>
  </div>
</section>

<section class="section band-green lattice" id="workflow">
  <div class="wrap">
    <div class="sec-head" data-reveal style="margin-inline:auto;text-align:center"><h2>One booking, followed through the whole hotel</h2><p>Maha is designed so data moves from one product to the next instead of being re-entered. Here is how a single guest booking travels through the ecosystem.</p></div>
    {workflow()}
    <p class="flow-note">Steps marked coming soon show how those products are designed to connect once released.</p>
  </div>
</section>

<section class="section" id="trust">
  <div class="wrap">
    <div class="sec-head" data-reveal><h2>Security and trust</h2><p>Your business data should remain organised, controlled and accessible to the right people.</p></div>
    <div class="trust-grid">
      <div class="trust"><h3>Modern cloud architecture</h3><p>Designed with modern cloud architecture, so your team can sign in from wherever they work.</p></div>
      <div class="trust"><h3>Role-based access</h3><p>Role-based access controls let each person see and do what their job requires.</p></div>
      <div class="trust"><h3>Built for hospitality</h3><p>Built with hospitality businesses in mind, from shift-based front desk work to management reporting.</p></div>
    </div>
    <p style="margin-top:1.5rem"><a href="security.html">Read how we approach security</a></p>
  </div>
</section>

<section class="section cta">
  <div class="wrap cta-in">
    <div><h2>Talk to Maha</h2><p>Tell us about your property and we will show you how Maha fits the way you work.</p></div>
    <div class="actions"><a class="btn btn-green" href="contact.html">Request a demo</a><a class="btn btn-line" href="pricing.html">See pricing</a></div>
  </div>
</section>'''
    return page("index.html", "Home", "Maha Hub builds connected hospitality technology: Maha PMS, booking engine, channel connectivity and marketing for hotels, resorts and accommodation businesses.", body)

UNS = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w=1800&q=72"
# Bagan wall painting (Upali Thein, Bagan; photo by Anandajoti Bhikkhu, CC BY-SA 3.0). To self-host, save it as
# site/assets/banners/bagan-mural.jpg and change MURAL to "assets/banners/bagan-mural.jpg".
MURAL = "https://photodharma.net/Myanmar/Upali/images/Upali-Slide-00017.jpg"
MURAL_FALLBACK = UNS.format("1586359024637-e5bc5c8db4a3")
# Each page opens on its own scene: (image, focal point)
PH_IMG = {
    "Products":         ("assets/banners/heritage.jpg", "50% 55%"),
    "Solutions":        (HERO, "22% 72%"),
    "About Maha":       ("assets/banners/golden.jpg", "62% 38%"),
    "Pricing":          (UNS.format("1584897356466-858d9b6c53d1"), "50% 60%"),
    "Security":         (MURAL, "22% 42%"),
    "Contact":          (UNS.format("1468336210566-1e743694dc18"), "50% 62%"),
    "Privacy Policy":   (HERO, "48% 50%"),
    "Terms of Service": (UNS.format("1499123785106-343e69e68db1"), "50% 55%"),
    "Refund Policy":    (UNS.format("1583257242616-b4c5a5dee7d0"), "50% 58%"),
}
def page_hero(crumb, h1, intro):
    src, pos = PH_IMG.get(crumb, (HERO, "60% 50%"))
    fb = f' onerror="this.onerror=null;this.src=\'{MURAL_FALLBACK}\';this.style.objectPosition=\'50% 30%\'"' if src == MURAL else ""
    return f'''<section class="page-hero2{' mural' if src == MURAL else ''}"><img class="fade-art fa-hero" src="{src}" alt="" aria-hidden="true" style="object-position:{pos}"{fb}><div class="wrap"><p class="crumb"><a href="index.html">Home</a> / {esc(crumb)}</p><div class="label-line">{ORN}</div><h1>{esc(h1)}</h1><p>{intro}</p></div></section>'''
def _old_page_hero(crumb, h1, intro):
    return f'''<section class="page-hero lattice"><div class="wrap"><p class="crumb"><a href="index.html">Home</a> / {esc(crumb)}</p><h1>{esc(h1)}</h1><p>{intro}</p></div></section>'''

def products():
    navs = "".join(f'<a href="#{p["id"]}" class="{"dev" if p["status"] == DEV else ""}">{p["name"]}</a>' for p in PRODUCTS)
    blocks = []
    for p in PRODUCTS:
        feats = "".join(f"<li>{CHECK}{esc(c)}</li>" for c in p["caps"])
        q = esc(p["name"]).replace(" ", "%20")
        cta = (f'<a class="btn btn-green" href="contact.html?product={q}">Request a demo</a><a class="btn btn-line" href="{APP}{p["app"]}">Sign in to {esc(p["name"])}</a>' if p["status"] == LIVE
               else f'<a class="btn btn-line" href="contact.html?product={q}">Register interest</a>')
        note = "" if p["status"] == LIVE else '<p style="font-size:.9rem;color:var(--mut)">This product is coming soon and is not available yet.</p>'
        g = p.get("grad")
        st = f' style="--g1:{g[0]};--g2:{g[1]}"' if g else ""
        blocks.append(f'''<article class="p-detail{' dev' if p['status'] == DEV else ' live'}" id="{p['id']}"{st} data-reveal>
  <div>{badge(p)}<h2>{esc(p['name'])}</h2><p style="font-weight:600;color:var(--bronze);margin-bottom:.5rem">{esc(p['kind'])}</p><p class="lede">{esc(p['line'])}</p><p>{esc(p['desc'])}</p>{note}<div class="actions">{cta}</div></div>
  <ul class="feat-list">{feats}</ul>
</article>''')
    body = page_hero("Products", "Maha products", "Maha PMS, Maha Connect, Maha Booking and Maha Reach are available now. Each is opened for your hotel by Padauk. Products marked coming soon are not available yet.") + f'''
<section class="section"><div class="wrap"><nav class="p-nav" aria-label="Products">{navs}</nav>{"".join(blocks)}</div></section>'''
    return page("products.html", "Products", "Maha PMS, Maha Connect, Maha Booking and Maha Reach are available now. Maha HR, Account, Manage, POS, Stock and Sales are coming soon.", body)

def solutions():
    body = page_hero("Solutions", "Solutions for hospitality businesses", "Whether you run one boutique hotel or several properties, Maha gives you a connected foundation you can build on.") + f'''
<section class="section"><div class="wrap">
  <div class="sol-grid">{sol_block()}</div>
</div></section>
<section class="section band-ivory"><div class="wrap">
  <div class="sec-head" data-reveal><h2>From one property to many</h2><p>Start with the products you need now. As your business grows, and as more of the ecosystem is released, Maha grows with you on the same data.</p></div>
  {SCALE}
</div></section>
<section class="section cta"><div class="wrap cta-in"><div><h2>Find the right setup</h2><p>Tell us about your properties and we will recommend where to start.</p></div><div class="actions"><a class="btn btn-green" href="contact.html">Talk to Maha</a></div></div></section>'''
    return page("solutions.html", "Solutions", "Maha solutions for independent hotels, resorts, boutique hotels, serviced apartments, hotel groups and multi-property operators.", body)

def about():
    body = page_hero("About Maha", "About Maha Hub", "A hospitality technology platform for hotels and accommodation businesses.") + f'''
<section class="section"><div class="wrap about-grid">
  <div>
    <h2>What we do</h2>
    <p>Maha Hub is a hospitality technology platform focused on helping hotels and accommodation businesses manage their operations through connected digital systems.</p>
    <p>Our goal is to simplify hotel technology by connecting operational, commercial and management functions within one ecosystem. Maha PMS sits at the core, and each Maha product is designed to work with the same hotel data instead of standing alone.</p>
    <p>Customers subscribe to or purchase access to Maha software and related digital hospitality services. Today that includes Maha PMS, Maha Connect, Maha Booking and Maha Reach, with more products coming soon. Each product is opened for a hotel by Padauk.</p>
    <p>Maha Hub is offered by {OPERATOR}. It is being designed for English, Thai and Myanmar.</p>
    <p style="font-family:var(--title);color:var(--green);font-size:1.15rem">More than software — a partner in your growth.</p>
  </div>
  <div>
    <ul class="principles">
      <li><b>Connected, not separate</b><span>Data moves between Maha products, so teams stop re-typing the same information.</span></li>
      <li><b>Clear about what is ready</b><span>We label every product as available now or coming soon, so customers can plan with confidence.</span></li>
      <li><b>Made for hotel teams</b><span>Front desk, housekeeping, sales and management each get tools that fit their work.</span></li>
    </ul>
  </div>
</div></section>
<section class="section cta"><div class="wrap cta-in"><div><h2>Talk to Maha</h2><p>Questions about Maha or how it could work for your property?</p></div><div class="actions"><a class="btn btn-green" href="contact.html">Contact us</a></div></div></section>'''
    return page("about.html", "About Maha", "Maha Hub is a hospitality technology platform helping hotels and accommodation businesses run operations through connected digital systems.", body)

def pricing():
    def price(k):
        v = PRICES[k]
        return f'<b>{esc(v)}</b><span>Billed by subscription</span>' if v else '<b>Contact for pricing</b><span>Quoted for your property</span>'
    li = lambda items: "".join(f"<li>{CHECK}<span>{i}</span></li>" for i in items)
    body = page_hero("Pricing", "Pricing", "Flexible plans designed for different hospitality businesses.") + f'''
<section class="section"><div class="wrap">
  <div class="plans">
    <div class="plan"><h3>Single property</h3><p class="for">For independent hotels, boutique hotels and serviced apartments.</p><div class="price">{price("single")}</div>
      <ul>{li(["Maha PMS", "Maha Connect (optional)", "Maha Booking (optional)", "Maha Reach (optional)", "Onboarding and support"])}</ul><a class="btn btn-line" href="contact.html?product=Pricing%20-%20Single%20property">Request a quote</a></div>
    <div class="plan mid"><h3>Multi-property</h3><p class="for">For operators running more than one property.</p><div class="price">{price("multi")}</div>
      <ul>{li(["Everything in Single property", "Several properties under one account", "Onboarding and support"])}</ul><a class="btn btn-green" href="contact.html?product=Pricing%20-%20Multi-property">Talk to Maha</a></div>
    <div class="plan"><h3>Hotel groups</h3><p class="for">For hotel groups and hospitality companies with custom needs.</p><div class="price">{price("group")}</div>
      <ul>{li(["A tailored set of Maha products", "Group onboarding", "First access to products coming soon"])}</ul><a class="btn btn-line" href="contact.html?product=Pricing%20-%20Hotel%20group">Request a demo</a></div>
  </div>
</div></section>
<section class="section band-ivory"><div class="wrap">
  <div class="sec-head" data-reveal><h2>How buying Maha works</h2></div>
  <div class="facts">
    <div><h3>What you pay for</h3><p>Access to Maha software as a subscription, plus any related digital hospitality services agreed in your quote, such as onboarding.</p></div>
    <div><h3>Your quote</h3><p>Prices depend on your property type, size and the products you choose. Your quote confirms the plan, billing period and currency before you pay.</p></div>
    <div><h3>Payment</h3><p>Payments are processed securely by a third-party payment provider. We do not store full card numbers.</p></div>
    <div><h3>Changes and cancellation</h3><p>You can cancel at the end of a billing period. See our <a href="refund.html">Refund and Cancellation Policy</a> and <a href="terms.html">Terms of Service</a>.</p></div>
  </div>
</div></section>
<section class="section cta"><div class="wrap cta-in"><div><h2>Get a quote</h2><p>Tell us about your property and the products you need.</p></div><div class="actions"><a class="btn btn-green" href="contact.html">Talk to Maha</a></div></div></section>'''
    return page("pricing.html", "Pricing", "Flexible Maha Hub plans for single properties, multi-property operators and hotel groups. Contact us for a quote.", body)

def contact():
    opts = "".join(f'<option value="{esc(p["name"])}">{esc(p["name"])}{"" if p["status"] == LIVE else " (in development)"}</option>' for p in PRODUCTS)
    opts += '<option value="Pricing - Single property">Pricing: single property</option><option value="Pricing - Multi-property">Pricing: multi-property</option><option value="Pricing - Hotel group">Pricing: hotel group</option><option value="Other">Something else</option>'
    body = page_hero("Contact", "Talk to Maha", "Ask about Maha products, request a demo or get a quote for your property.") + f'''
<section class="section band-grey"><div class="wrap contact-grid">
  <form class="form" id="contact-form" data-to="{EMAIL}" novalidate>
    <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" autocomplete="name" required><span class="err">Enter your name.</span></div>
    <div class="field"><label for="f-business">Business / hotel</label><input id="f-business" name="business" autocomplete="organization" required><span class="err">Enter your business or hotel name.</span></div>
    <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required><span class="err">Enter a valid email address.</span></div>
    <div class="field"><label for="f-phone">Phone <span>(optional)</span></label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
    <div class="field"><label for="f-country">Country</label><input id="f-country" name="country" autocomplete="country-name" required><span class="err">Enter your country.</span></div>
    <div class="field"><label for="f-interest">Interested in <span>(optional)</span></label><select id="f-interest" name="interest"><option value="">Choose a product</option>{opts}</select></div>
    <div class="field full"><label for="f-message">Message</label><textarea id="f-message" name="message" required></textarea><span class="err">Tell us how we can help.</span></div>
    <div class="field full"><button class="btn btn-green" type="submit">Send message</button></div>
    <p class="note">Sending opens your email app with your message ready to send to {EMAIL}.</p>
    <div class="form-done" role="status">Your email app should now be open with your message. Press send there to reach us. If it did not open, email us at <a href="mailto:{EMAIL}">{EMAIL}</a>.</div>
  </form>
  <aside class="side">
    <div class="blk"><h3>Email</h3><p><a href="mailto:{EMAIL}">{EMAIL}</a></p></div>
    <div class="blk"><h3>Website</h3><p><a href="{SITE}">maha-hub.com</a></p></div>
    <div class="blk"><h3>Existing customers</h3><p>Sign in at <a href="{SIGN_IN}">maha-hub.com/ecosystem</a> and use Contact Support, or email <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p></div>
    <div class="blk"><h3>Billing questions</h3><p>See the <a href="refund.html">Refund and Cancellation Policy</a>, or email us with your business name.</p></div>
  </aside>
</div></section>'''
    return page("contact.html", "Contact", f"Contact Maha Hub for demos, pricing and support. Email {EMAIL}.", body)

def doc_page(fname, crumb, h1, intro, sections, desc):
    toc = "".join(f'<li><a href="#{sid}">{esc(t)}</a></li>' for sid, t, _ in sections)
    secs = "".join(f'<h2 id="{sid}">{esc(t)}</h2>{c}' for sid, t, c in sections)
    body = page_hero(crumb, h1, intro) + f'''
<section class="section"><div class="wrap doc"><ul class="toc">{toc}</ul><div class="prose"><p class="updated">Last updated: {UPDATED}</p>{secs}</div></div></section>'''
    return page(fname, crumb, desc, body)

COMPANY = f'<div class="callout"><p>Maha Hub is a product of {OPERATOR} ("Padauk"). Registered address: {fill(LEGAL_ADDRESS)}. Contact: <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p></div>'

def security():
    S = [
     ("summary", "Summary", f"""<div class="keypoints"><p><b>Our commitment.</b> Maha Hub is built so that each hotel's data is reachable only by the people that hotel authorises, travels over encrypted connections, and is handled by a small set of named infrastructure providers.</p>
<ul><li>Every Maha product is opened for a hotel individually by Padauk. Nothing is switched on by default.</li>
<li>Access inside a hotel is controlled by user roles and staff shifts.</li>
<li>Card payments are handled by Stripe. Maha Hub never receives or stores full card numbers.</li>
<li>We do not claim certifications we do not hold.</li></ul></div>"""),
     ("principles", "Security principles", """<p>Our approach to security rests on five principles that guide how Maha is designed, operated and supported:</p>
<ul><li><b>Least privilege.</b> People and systems receive only the access they need for their role, and no more.</li>
<li><b>Separation by hotel and by product.</b> Each hotel's workspace and each Maha product are opened separately, so access to one does not grant access to another.</li>
<li><b>Encryption in transit.</b> Maha Hub and its products are served only over HTTPS, so data moving between your device and Maha is encrypted.</li>
<li><b>Accountability.</b> Each user signs in with their own account, and front desk work is tied to a named shift.</li>
<li><b>Transparency.</b> We describe our safeguards accurately and tell customers what we do, and do not, provide.</li></ul>"""),
     ("access", "Access control", """<ul><li><b>Individual accounts.</b> Every user signs in with their own credentials. Shared logins should not be used.</li>
<li><b>Role-based permissions.</b> Roles such as manager, front desk and housekeeping limit what each user can see and change.</li>
<li><b>Shift-based sign-in.</b> Front desk users sign in to a named shift, linking transactions and cash handling to the right person and time.</li>
<li><b>Product activation.</b> Maha Connect, Maha Booking and Maha Reach are opened per hotel by Padauk on request, keeping each hotel's footprint to what it actually uses.</li>
<li><b>Prompt removal.</b> Customers can remove users at any time, and should do so as soon as a staff member leaves.</li></ul>"""),
     ("infrastructure", "Infrastructure and providers", """<p>Maha Hub runs on established cloud infrastructure and uses a small number of specialist providers, each bound by its own security and privacy commitments:</p>
<ul><li><b>Cloudflare</b> for hosting, content delivery and network protection of the Maha Hub website and applications.</li>
<li><b>Stripe</b> for payment processing. Payment details are entered directly with Stripe, which is responsible for protecting card data.</li>
<li>A cloud database for storing customer business data used to provide the service.</li></ul>
<p>We review providers before adopting them and keep the list as short as the service allows.</p>"""),
     ("payments", "Payments", """<p>Subscription payments and any card payments made through Maha are processed by Stripe. Maha Hub does not receive, store or have access to full payment card numbers or security codes. Staff must never enter card numbers into notes, messages or free-text fields in Maha.</p>"""),
     ("shared", "Shared responsibility", """<p>Security works best as a partnership. Maha Hub is responsible for the security of the service. Each customer is responsible for how the service is used within its hotel, including:</p>
<ul><li>choosing strong passwords and keeping them private;</li>
<li>assigning the right role to each user and reviewing access regularly;</li>
<li>removing access for staff who leave;</li>
<li>keeping the devices used to access Maha secure and up to date;</li>
<li>entering only the guest and staff information it is entitled to collect.</li></ul>"""),
     ("incidents", "Incident response", f"""<p>If we become aware of a security incident affecting customer data, we will investigate promptly, take steps to contain it, and notify affected customers without undue delay with the information we have at the time. Where the law requires us to notify a regulator or affected individuals, we will do so within the required period, or support the customer in doing so where the customer is responsible for that notice.</p>"""),
     ("certifications", "Certifications and compliance", """<p>Maha Hub does not currently hold formal security certifications such as ISO 27001 or SOC 2, and is not itself certified under PCI DSS. Card payments are handled by Stripe, which maintains its own payment card compliance. We will only list certifications on this page once they have been formally obtained.</p>
<p>Maha is designed to help hotels meet their own obligations under data protection laws such as Thailand's Personal Data Protection Act, by keeping guest data organised, access-controlled and limited to authorised users.</p>"""),
     ("report", "Reporting a vulnerability", f"""<p>We welcome reports from anyone who believes they have found a security weakness in Maha Hub. Please email <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a> with a clear description and the steps to reproduce it.</p>
<p>When testing, please act in good faith: do not access, change or delete data that is not yours, do not disrupt the service for others, and give us reasonable time to fix the issue before sharing it publicly. We will acknowledge genuine reports and keep you informed of our progress.</p>
<p class="img-credit">Banner image: wall painting at Upali Thein, Bagan, a UNESCO World Heritage Site. Photo by Anandajoti Bhikkhu (photodharma.net), CC BY-SA 3.0.</p>"""),
    ]
    return doc_page("security.html", "Security", "Data security", "How Maha Hub protects hotel and guest data: our principles, safeguards, providers and commitments.", S, "Maha Hub data security: least-privilege access, separation by hotel and product, encrypted connections, Stripe payments and a clear incident response commitment.")

def privacy():
    S = [
     ("who", "1. Who we are", COMPANY + """<p>This Privacy Policy explains how Padauk Hospitality Technology and Academy ("Padauk", "we", "us"), the provider of Maha Hub, collects, uses, shares and protects personal data when you visit maha-hub.com, contact us, subscribe to Maha, or use Maha software.</p>
<p>We process personal data in line with applicable data protection laws, including, where they apply, Thailand's Personal Data Protection Act B.E. 2562 (2019) ("PDPA") and the EU and UK General Data Protection Regulation ("GDPR").</p>"""),
     ("roles", "2. Our role: controller and processor", """<p>Data protection law distinguishes between a <b>controller</b>, which decides why and how personal data is processed, and a <b>processor</b>, which processes it on a controller's instructions.</p>
<ul><li><b>Padauk as controller.</b> We are the controller for personal data about website visitors, people who contact us, and the business contacts and users of our customers, which we use to run our business and the Maha service.</li>
<li><b>Padauk as processor.</b> When a hotel enters guest, reservation or staff data into Maha, the hotel is the controller of that data and Padauk processes it only on the hotel's behalf and instructions, to provide the service. Guests who have questions about their data should contact the hotel directly.</li></ul>"""),
     ("collect", "3. Personal data we collect", """<table class="ltable"><thead><tr><th>Category</th><th>Examples</th><th>Source</th></tr></thead><tbody>
<tr><td>Enquiry and contact data</td><td>Name, business or hotel name, email, phone, country, message</td><td>You, through our forms or email</td></tr>
<tr><td>Account and user data</td><td>Name, username, email, role, shift records, sign-in activity</td><td>The customer and its users</td></tr>
<tr><td>Billing data</td><td>Billing contact, plan, invoices, payment status</td><td>The customer and Stripe (card numbers stay with Stripe)</td></tr>
<tr><td>Customer business data</td><td>Guest, reservation, folio and staff records entered by a hotel</td><td>The hotel, as controller</td></tr>
<tr><td>Technical data</td><td>IP address, browser and device type, pages visited, error logs</td><td>Automatically, when you use our website or apps</td></tr></tbody></table>
<p>We do not ask for, and customers should not enter, sensitive personal data in Maha unless the law requires it for guest registration.</p>"""),
     ("purposes", "4. Why we use it and our legal bases", """<table class="ltable"><thead><tr><th>Purpose</th><th>Legal basis</th></tr></thead><tbody>
<tr><td>Providing, operating and supporting Maha for our customers</td><td>Performance of a contract</td></tr>
<tr><td>Responding to enquiries, demos and quotes</td><td>Steps at your request before a contract; legitimate interests</td></tr>
<tr><td>Billing, payments and accounting records</td><td>Contract; legal obligation</td></tr>
<tr><td>Keeping Maha secure and preventing fraud or misuse</td><td>Legitimate interests; legal obligation</td></tr>
<tr><td>Improving our website and products using usage information</td><td>Legitimate interests</td></tr>
<tr><td>Sending news about Maha products</td><td>Consent, which you may withdraw at any time</td></tr>
<tr><td>Meeting legal, tax and regulatory requirements</td><td>Legal obligation</td></tr></tbody></table>
<p>We do not sell personal data, and we do not use customer business data for advertising. We do not make decisions about individuals based solely on automated processing.</p>"""),
     ("share", "5. Who we share it with", """<p>We share personal data only where necessary, and only with:</p>
<ul><li><b>Service providers</b> acting on our instructions, including Cloudflare (hosting, content delivery and network security), Stripe (payment processing) and cloud database hosting. Each is bound by contractual confidentiality and security obligations.</li>
<li><b>The customer</b> whose account you use, for user and activity information within that customer's workspace.</li>
<li><b>Authorities or advisers</b> where required by law, to protect rights or safety, or in connection with legal claims.</li>
<li><b>A successor business</b> if Maha Hub is reorganised, merged or sold, subject to this policy.</li></ul>"""),
     ("transfers", "6. International transfers", """<p>Our providers may process data in countries other than the one in which it was collected. Where this happens, we rely on appropriate safeguards required by applicable law, such as contractual protections, so that personal data remains protected to the standard described in this policy.</p>"""),
     ("security", "7. How we protect personal data", """<p>We apply technical and organisational measures appropriate to the risk, including role-based access controls, individual user accounts, shift-based sign-in, per-hotel and per-product activation, encrypted connections (HTTPS), and the security protections of our infrastructure providers. Read more on our <a href="security.html">Data security</a> page.</p>
<p>No system is completely secure. If a personal data breach occurs that is likely to affect your rights, we will notify affected customers and, where required, regulators and individuals within the periods the law sets.</p>"""),
     ("keep", "8. How long we keep it", """<table class="ltable"><thead><tr><th>Data</th><th>Retention</th></tr></thead><tbody>
<tr><td>Enquiries that do not become customers</td><td>Up to 24 months after our last contact, unless you ask us to delete them sooner</td></tr>
<tr><td>Account and user data</td><td>For the life of the subscription, then deleted or anonymised after it ends, unless needed for a dispute</td></tr>
<tr><td>Customer business data</td><td>For the life of the subscription; returned or deleted on request when it ends, subject to the customer agreement</td></tr>
<tr><td>Billing and accounting records</td><td>As long as tax and accounting laws require</td></tr>
<tr><td>Technical logs</td><td>Only as long as needed for security and troubleshooting</td></tr></tbody></table>"""),
     ("rights", "9. Your rights", f"""<p>Subject to applicable law, you have the right to:</p>
<ul><li>be informed about how your personal data is used;</li><li>access and receive a copy of your personal data;</li>
<li>correct personal data that is inaccurate or incomplete;</li><li>request deletion, destruction or anonymisation;</li>
<li>restrict or object to certain processing, including direct marketing;</li><li>request data portability;</li>
<li>withdraw consent at any time, without affecting earlier processing;</li><li>complain to the relevant data protection authority, such as Thailand's Personal Data Protection Committee.</li></ul>
<p>To exercise a right, email <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>. We may need to verify your identity, and will respond within the time the law requires, normally within 30 days. If your request concerns guest data held by a hotel, we will pass it to that hotel and assist it in responding.</p>"""),
     ("cookies", "10. Cookies", """<p>Our website uses only cookies and similar technologies that are strictly necessary for it to work and to keep it secure. We do not currently use advertising cookies. If we introduce analytics or marketing cookies, we will update this policy and ask for consent where the law requires it.</p>"""),
     ("children", "11. Children", """<p>Maha Hub is a business service and is not directed to children. We do not knowingly collect personal data from children for our own purposes. Where a hotel records a child guest, the hotel is responsible for that data as controller.</p>"""),
     ("changes", "12. Changes to this policy", """<p>We may update this policy to reflect changes in our services or the law. The date at the top shows the latest version. Where changes are significant, we will give notice on our website or directly to customers before they take effect.</p>"""),
     ("contact", "13. Contact", f"""<p>For any privacy question or request, contact Padauk at <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>.</p>"""),
    ]
    return doc_page("privacy.html", "Privacy Policy", "Privacy Policy", "How Padauk, the provider of Maha Hub, collects, uses, shares and protects personal data, and the rights you have.", S, "Maha Hub Privacy Policy: roles, data we collect, legal bases, sharing, transfers, retention, security and your rights under the PDPA and GDPR.")

def terms():
    S = [
     ("about", "About these terms", COMPANY + "<p>These Terms of Service apply to access to and use of Maha software and related services provided by Maha Hub (\"we\", \"us\"). By subscribing to or using Maha, the customer (\"you\") agrees to these terms.</p>"),
     ("service", "The service", "<p>Maha Hub provides hospitality technology software as a service for hotels, resorts and accommodation businesses, together with related digital services such as onboarding and support. The products included in your subscription are listed in your quote or order.</p><p>Products described on our website as in development are not part of any subscription until we confirm they are available to you.</p>"),
     ("accounts", "Accounts", "<p>You are responsible for your users, for keeping sign-in details confidential, and for all activity under your accounts. Tell us promptly if you suspect unauthorised access.</p>"),
     ("fees", "Fees and payment", "<p>Fees, billing period and currency are set out in your quote or order. Subscriptions are paid in advance for each billing period and renew automatically unless cancelled. Payments are processed by a third-party payment provider. Taxes are added where required.</p>"),
     ("cancel", "Cancellation and refunds", "<p>Cancellation and refunds are covered by our <a href=\"refund.html\">Refund and Cancellation Policy</a>, which forms part of these terms.</p>"),
     ("use", "Acceptable use", "<p>You agree not to misuse the service, including attempting to access other customers' data, interfering with the service, or using it for unlawful purposes.</p>"),
     ("data", "Your data", "<p>You keep ownership of the business data you enter into Maha. You give us permission to process it to provide and support the service, as described in our <a href=\"privacy.html\">Privacy Policy</a>. You are responsible for having the right to enter guest and staff information.</p>"),
     ("availability", "Availability and changes", "<p>We work to keep Maha available and reliable, but do not guarantee uninterrupted service. We may improve or change features over time and will give notice of material changes that reduce the service you pay for.</p>"),
     ("liability", "Liability", "<p>To the extent permitted by law, the service is provided as is, and our total liability for any claim is limited to the fees you paid for the service in the twelve months before the claim. We are not liable for indirect or consequential losses, such as lost profits or bookings.</p>"),
     ("termination", "Termination", "<p>Either party may end the subscription as described in the Refund and Cancellation Policy. We may suspend access for non-payment or serious breach of these terms after giving notice where reasonable.</p>"),
     ("law", "Governing law", f"<p>These terms are governed by {fill(GOVERNING_LAW)}.</p>"),
     ("contact", "Contact", f"<p><a href=\"mailto:{EMAIL}\">{EMAIL}</a></p>"),
    ]
    return doc_page("terms.html", "Terms of Service", "Terms of Service", "The terms for using Maha software and services.", S, "Maha Hub Terms of Service.")

def refund():
    S = [
     ("summary", "Summary", COMPANY + "<p>Maha software is sold as a subscription. You can cancel at any time, and your access continues until the end of the billing period you have paid for.</p>"),
     ("cancel", "How to cancel", f"<p>Email <a href=\"mailto:{EMAIL}\">{EMAIL}</a> from your account's registered email address with your business name. We will confirm the cancellation and the date your access ends. Cancellation stops future renewals.</p>"),
     ("refunds", "Refunds", "<ul><li>Subscription fees already paid for the current billing period are not refunded when you cancel, unless required by law.</li><li>If you were charged in error, for example a duplicate charge or a charge after cancellation, contact us within 14 days of the charge and we will refund the incorrect amount.</li><li>Fees for onboarding, setup or other services are non-refundable once the work has started.</li></ul>"),
     ("annual", "Annual plans", "<p>If you pay for a longer billing period, such as a year, cancellation takes effect at the end of that period.</p>"),
     ("ours", "If we end the service", "<p>If we stop providing a product you have paid for before the end of your billing period, we will refund the unused portion of the fees for that product.</p>"),
     ("how", "How refunds are paid", "<p>Approved refunds are returned to the original payment method through our payment provider. The time to appear depends on your bank or card issuer.</p>"),
     ("contact", "Questions", f"<p><a href=\"mailto:{EMAIL}\">{EMAIL}</a></p>"),
    ]
    return doc_page("refund.html", "Refund Policy", "Refund and Cancellation Policy", "How cancellation and refunds work for Maha subscriptions.", S, "Maha Hub Refund and Cancellation Policy.")

def sitemap(files):
    urls = "".join(f"<url><loc>{SITE}/{'' if f == 'index.html' else f}</loc></url>" for f in files)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>'

if __name__ == "__main__":
    out = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    pages = {"index.html": home(), "products.html": products(), "solutions.html": solutions(), "about.html": about(),
             "pricing.html": pricing(), "contact.html": contact(), "security.html": security(),
             "privacy.html": privacy(), "terms.html": terms(), "refund.html": refund()}
    for f, h in pages.items():
        open(os.path.join(out, f), "w", encoding="utf-8").write(h)
    open(os.path.join(out, "sitemap.xml"), "w").write(sitemap(list(pages)))
    open(os.path.join(out, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    print("Built", len(pages), "pages into", out)
