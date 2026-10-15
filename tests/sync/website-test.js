/* The company website: every page is built, every inside link leads somewhere, the old company name is gone, and the contact form checks its answers.
     node tests/sync/website-test.js */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const pages = ['index', 'about', 'maha-hub-solutions', 'products', 'pricing', 'security', 'maha-hub-academy', 'contact', 'privacy', 'terms', 'refund', 'reset-password', '404'];
const html = n => fs.readFileSync(path.join(root, n + '.html'), 'utf8');
T('all pages exist', pages.every(p => fs.existsSync(path.join(root, p + '.html'))));
/* addresses the site or the apps answer to */
const known = new Set(['/', '/favicon.ico', '/solutions', '/solutions-PMS', '/ecosystem/Connect/', '/ecosystem/Booking/', '/ecosystem/Reach/', '/ecosystem/Sales/']);
const exists = href => { const p = href.split('#')[0].split('?')[0]; if (!p || known.has(p)) return true; if (/^\/(assets|brand|icons)\//.test(p)) return fs.existsSync(path.join(root, p)); return fs.existsSync(path.join(root, p.replace(/^\//, '') + '.html')); };
const broken = [];
for (const p of pages) for (const m of html(p).matchAll(/(?:href|src)="(\/[^"]*)"/g)) if (!exists(m[1])) broken.push(p + ': ' + m[1]);
T('every inside link and picture leads somewhere', broken.length === 0, broken.slice(0, 5).join(' ; '));
const anchors = [];
for (const p of pages) { const t = html(p); const ids = new Set([...t.matchAll(/id="([^"]+)"/g)].map(m => m[1])); for (const m of t.matchAll(/href="#([^"]+)"/g)) if (!ids.has(m[1])) anchors.push(p + '#' + m[1]); }
T('every in-page link (#...) has its place', anchors.length === 0, anchors.slice(0, 5).join(' ; '));
const all = pages.map(html).join('\n').replace(/<script[\s\S]*?<\/script>/g, '');   /* the words people read, not program code */
T('the company name is Maha Hub Group of Companies Limited and nothing says Padauk', /Maha Hub Group of Companies Limited/.test(all) && !/Padauk/.test(all));
T('both brands are on the home page, named Maha Solutions and Maha Academy (the group name is only the parent company)', /Maha Solutions/.test(html('index')) && /Maha Academy/.test(html('index')) && !/Maha Hub Solutions|Maha Hub Academy/.test(pages.map(html).join('\n')));
T('the old logo is gone from the search-engine icons: favicon.ico exists and is the 48px new logo, linked first; the old icon files hold the new logo', fs.existsSync(path.join(root, 'favicon.ico')) && fs.readFileSync(path.join(root, 'favicon.ico')).readUInt16LE(2) === 1 && /rel="icon" href="\/favicon.ico" sizes="48x48"/.test(html('index')) && ['apple-touch-icon', 'favicon-32', 'favicon-48', 'icon-192', 'icon-512', 'pwa-192', 'maha-mark-sq'].every(n => fs.existsSync(path.join(root, 'icons', n + '.png'))) && fs.readFileSync(path.join(root, 'icons', 'icon-512.png')).readUInt32BE(16) === 512);
T('every Sign in goes to the Main sign-in page /solutions (the systems are never linked from the website)', /href="\/solutions"/.test(html('index')) && /href="\/solutions">Sign in<\/a>/.test(html('products')) && !/href="\/(solutions-PMS|ecosystem\/)/.test(html('products')));
/* the registered address and phone of the parent company */
const ADDR = '222/B Min Ye Kyaw Swar 3rd Street, Yangon 11091, Myanmar (Burma)';
T('the registered address is in every page footer, the About company details, the Contact page and the privacy, terms and refund pages', pages.filter(p => p !== 'reset-password').every(p => html(p).includes(ADDR)) && /Registered address<\/th><td>222\/B/.test(html('about')) && /Registered office<\/b>222\/B/.test(html('contact')) && ['privacy', 'terms', 'refund'].every(p => html(p).includes('Registered address: ' + ADDR)));
T('the phone is shown and can be tapped to call', /href="tel:\+959450015567"[^>]*>\+95 9 450 015 567</.test(html('contact')) && /href="tel:\+959450015567"/.test(html('index')));
T('search engines get the address and phone as structured data', /"addressLocality":"Yangon"/.test(html('index')) && /"postalCode":"11091"/.test(html('index')) && /"addressCountry":"MM"/.test(html('index')) && /"telephone":"\+959450015567"/.test(html('index')));
T('only the governing-law line of the Terms still waits for the owner', (all.match(/\[To be added\]/g) || []).length === 1 && /governed by <span class="fill">\[To be added\]/.test(html('terms')));
T('every page has a title, a description and a canonical address', pages.every(p => /<title>.+<\/title>/.test(html(p)) && /name="description"/.test(html(p)) && /rel="canonical"/.test(html(p))));
T('the password page keeps its working script and stays out of search', /maha_auth|supabase\.co/.test(html('reset-password')) && /noindex/.test(html('reset-password')) && /id="rp-form"/.test(html('reset-password')));
T('the sitemap lists the new pages and not the old ones', (s => /maha-hub-academy/.test(s) && /maha-hub-solutions/.test(s) && !/our-solutions/.test(s))(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8')));
T('the old website files are gone', !fs.existsSync(path.join(root, 'our-solutions.html')) && !fs.existsSync(path.join(root, 'assets', 'styles.css')) && !fs.existsSync(path.join(root, 'website', 'build.py')));

/* the contact form script */
const js = fs.readFileSync(path.join(root, 'assets', 'group.js'), 'utf8');
T('the contact form checks name, business, email, country and message before it opens the email app', /\['name', 'business', 'email', 'country', 'message'\]/.test(js) && /mailto:/.test(js) && /hello@maha-hub\.com/.test(js));
T('the site script is small', js.length < 9000, js.length + ' bytes');
const css = fs.readFileSync(path.join(root, 'assets', 'group.css'), 'utf8');
T('the colours come from the logo (green, gold, ivory)', /--green:#113732/.test(css) && /--gold:#C9A55A/.test(css) && /--ivory:#F1E5C9/.test(css));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
