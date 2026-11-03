/* Billing page (/billing) for every Maha system + the provider's Billing records.
     node tests/sync/billing-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const page = fs.readFileSync('billing/index.html', 'utf8');
const sql = fs.readFileSync('supabase/migrations/20261103_030_billing_records.sql', 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
T('page has the six eZee-style sections', ['Home', 'Quotes', 'Subscriptions', 'Invoices', 'Payments Made', 'Statements'].every(x => page.includes("'" + x + "'")));
T('home shows Balance Summary, Last Payment Made, My Details and a Pay link', ['Balance Summary', 'Last Payment Made', 'My Details', 'Pay &rarr;'].every(x => page.includes(x)));
T('Light and Dark, phone layout', page.includes('data-mode=dark') && page.includes('@media (max-width:800px)'));
T('the hotel page only reads: its only POST goes to sign-in', (page.match(/method:'POST'/g) || []).length === 3 && !/PATCH|DELETE|method:'PUT'/.test(page));
T('hotel text is escaped on the page', page.includes('const esc=') && !/\$\{r\.(no|note|paid_for)\}/.test(page));
T('table: only a platform admin can write, a hotel only reads its own', sql.includes('maha_can_access_property(property_id) or public.maha_is_platform_admin()') && (sql.match(/with check \(public\.maha_is_platform_admin\(\)\)/g) || []).length >= 1 && sql.includes('enable row level security') && sql.includes('revoke all on public.maha_billing_docs from public, anon, authenticated'));
T('the migration says it is not applied yet', /NOT APPLIED YET/.test(sql));
T('Renew Now / Contact provider and a Select System link open the Billing page in a new tab', src.includes("BILLING_URL='https://maha-hub.com/billing/'") && src.includes('href="${BILLING_URL}?hotel=') && src.includes("window.open(BILLING_URL+'?hotel='"));
T('provider console: a Billing button per hotel, a subscription record moves the hotel date', src.includes('data-bill="${h.code}">Billing</button>') && src.includes('async function billingAdmin(h)') && src.includes('h.set.subUntil=body.period_to'));
T('Backend: one Billing title with Overview, Quotes, Subscriptions, Invoices, Payments Made, Statements inside the PMS (no new tab), only for people with Setup access', ['home','quotes','subscriptions','invoices','payments','statements'].every(k => src.includes("'sbill." + k + "','setup'") ) && src.includes("g('Billing',['sbill.home'") && src.includes("VIEWS['sbill.'+k]=billView(k,t)") && !src.includes("VIEWS['set.billing']"));
T('provider: subscription +1/3/6 months and +1 year, revoke now', ['1','3','6','12'].every(n => src.includes('data-ext="' + n + '"')) && src.includes('id="sbR"') && src.includes('revoked (stopped now)'));
T("provider: Users' access window with extend, no limit and revoke (the owner is protected)", src.includes('function userAccessAdmin(h)') && src.includes('data-uacc="${h.code}"') && src.includes("data-ux=\"0:revoke\"") && src.includes('The owner account is protected and stays active.'));
T('every Billing subtitle has its own menu icon like the other menus', ['home:dash','quotes:clip','subscriptions:layers','invoices:receipt','payments:card','statements:book'].every(x => src.includes("'sbill." + x.split(':')[0] + "':'" + x.split(':')[1] + "'")));
process.exit(fails ? 1 : 0);
