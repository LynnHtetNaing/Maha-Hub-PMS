/* The company Sales (crm) and the hotel side can never mix: own address, own folder, own storage key, own table, never on the Main page,
   never opened by a hotel user. Reads the source only.   node tests/sync/crm-isolation-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const app = fs.readFileSync(path.join(root, 'ecosystem', 'index.html'), 'utf8');
const crm = fs.readFileSync(path.join(root, 'crm', 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workers', 'maha-hub-pms', 'src', 'index.js'), 'utf8');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
T('its own address, crm.maha-hub.com, set in both Worker files', ['wrangler.toml', 'workers/maha-hub-pms/wrangler.toml'].every(f => /CRM_HOST = "crm\.maha-hub\.com"/.test(fs.readFileSync(path.join(root, f), 'utf8'))));
T('its own folder: the Worker serves /crm/ only on its own address (and on test copies under /ecosystem/CRM)', /crm: \{ file: '\/crm\/index\.html'/.test(worker) && /\['CRM_HOST'/.test(worker));
T('the old shared Sales folder is gone', !fs.existsSync(path.join(root, 'sales')));
T('its own entry ticket, not the one the hotel Sales will use', crm.includes("var K='mahahub.entry.crm'") && !crm.includes("mahahub.entry.sales"));
T('its own table, and the hotel side of the PMS never reads or writes that table', crm.includes('maha_sales_records') && !app.includes('maha_sales_records'));
T('the chooser is built from the hotel systems, which do not contain the company Sales', /function hotelSystems\(h,u\)\{[\s\S]*?\n\}/.exec(app)[0].indexOf("'crm'") === -1);
T('only the PMS is released to hotels; the company Sales is checked as the Owner\'s own', app.includes("const RELEASED_SYSTEMS=['hub'];") && app.includes("if(kind==='crm')return isOwnerSession();"));
T('a hotel user never gets a ticket or a link: the Provider console menu is the only door', (app.match(/sysUrl\('crm'/g) || []).length === 2 && app.includes("['Company Sales','prov.crm']") && app.includes("Only the provider can open the company Sales."));
T('the address refuses hotel staff right after the password', app.includes("if(hostRole()==='console'||hostRole()==='crm'){if(MahaAuth.on())MahaAuth.signOut();err.textContent='This address is for the provider only.';return}"));
T('the company Sales gate wants the Owner flag', /t\.owner!==true/.test(crm));
T('search engines are told to stay out', fs.readFileSync(path.join(root, 'robots.txt'), 'utf8').includes('Disallow: /crm/'));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
