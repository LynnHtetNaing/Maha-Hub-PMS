/* Maha Sales (the company's own sales software, crm.maha-hub.com) and the hotel side can never mix: own address, own folder, own people and sign-in,
   own table, never on the Main page, never opened by a hotel user. Reads the source only.   node tests/sync/crm-isolation-test.js ecosystem/index.html */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = rd('ecosystem/index.html'), crm = rd('crm/index.html'), worker = rd('workers/maha-hub-pms/src/index.js');
const auth = rd('supabase/functions/username-auth/index.ts'), prov = rd('supabase/functions/platform-admin-provision/index.ts'), sql = rd('supabase/migrations/20261105_033_crm_team.sql');
let fails = 0; const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++ };
T('its own address, crm.maha-hub.com, set in both Worker files', ['wrangler.toml', 'workers/maha-hub-pms/wrangler.toml'].every(f => /CRM_HOST = "crm\.maha-hub\.com"/.test(rd(f))));
T('its own folder: the Worker serves /crm/ on its own address (and on test copies under /ecosystem/CRM)', /crm: \{ file: '\/crm\/'/.test(worker) && /\['CRM_HOST'/.test(worker));
T('the old shared Sales folder is gone', !fs.existsSync(path.join(root, 'sales')));
T('its own sign-in: nothing is handed over from another address, no entry ticket, no PMS session key', !/mahahub\.entry/.test(crm) && !/mahahub\.sbauth/.test(crm) && !/#mh=/.test(crm) && crm.includes("const SK = 'maha.crm.auth'"));
T('its own table, and the hotel side of the PMS never reads or writes the sales records or the team table directly', crm.includes('maha_sales_records') && !app.includes('maha_sales_records') && !app.includes('maha_crm_members'));
T('the chooser is built from the hotel systems, which do not contain the company Sales', !/function hotelSystems\(h,u\)\{[\s\S]*?\n\}/.exec(app)[0].includes('crm'));
T('only the PMS is released to hotels', app.includes("const RELEASED_SYSTEMS=['hub'];"));
T('no link from the PMS pages carries a sign-in to it (the Provider console only opens its plain address)', !/sysUrl\('crm'/.test(app) && app.includes("openApp(crmUrl(),'Maha Sales')") && !/crm/.test(/const SYS_HOSTS=\{[^}]*\}/.exec(app)[0]));
T('the sign-in service refuses anyone not on the team, right after the password and before any code is sent', auth.includes('body.app === "crm"') && auth.indexOf('body.app === "crm"') < auth.indexOf('if (requireCode) {', auth.indexOf('body.app === "crm"')) && auth.indexOf('body.app === "crm"') > auth.indexOf('signInWithPassword') && auth.includes('crm_sign_in_refused') && auth.includes('error: "not_allowed"'));
T('the team is added, switched off and reset only by the Master admin, from the Provider console', ['crm_add_member', 'crm_set_active', 'crm_reset_password', 'crm_list'].every(a => prov.includes('"' + a + '"')) && app.includes("MASTER_VIEWS=['prov.team','prov.crmteam','prov.adminlogs']") && app.includes("['Sales team','prov.crmteam']"));
T('a switched-off member is banned as well, so the session ends at the next refresh', /crm_set_active[\s\S]*?ban_duration: active \? "none" : "876000h"/.test(prov) || prov.includes('ban_duration: active ? "none" : "876000h"'));
T('database: records are open only to the active team and the provider, never to a hotel; the team list is written only by the trusted server', sql.includes('maha_is_crm_member()') && !sql.includes('maha_can_access_property') && /grant select on public\.maha_crm_members to authenticated/.test(sql) && !/grant (insert|update|delete)[^;]*maha_crm_members/.test(sql));
T('search engines are told to stay out', rd('robots.txt').includes('Disallow: /crm/'));
T('Main page: PMS and Maha Sales are the two big buttons; the hotel Sales address answers with the illustrated 404 (explorer and two cables), nothing else', app.includes("const CHOOSER_OPEN=['hub','sales'];") && app.includes('filter(s=>!pre||CHOOSER_OPEN.includes(s.kind))') && worker.includes('notPluggedIn(request, env)') && fs.existsSync(path.join(root, 'errors', 'unplugged.html')) && rd('errors/unplugged.html').includes('not plugged in yet'));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
