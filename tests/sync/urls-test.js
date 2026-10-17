/* Addresses: the Main page is /solutions, the PMS is /solutions-PMS; the old /ecosystem/ and /ecosystem/PMS/ still work and move to the new ones.
     node tests/sync/urls-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };

const code = cut('function hubBaseUrl()', 'function edcB64url') ;
const sysSegment = cut('function sysSegment', '\n');
function env(pathname) {
  const loc = { origin: 'https://maha-hub.com', pathname, href: 'https://maha-hub.com' + pathname }; const hist = { to: null, replaceState(a, b, u) { this.to = u; } };
  const doc = { title: '' };
  return new Function('location', 'history', 'document', 'URL', sysSegment + '\n' + code + '\nreturn {hubBaseUrl,sysFromPath,appPrefix,ecosystemDir,sysUrl,applySysPath};')(loc, hist, doc, URL) && (() => {
    const api = new Function('location', 'history', 'document', 'URL', sysSegment + '\n' + code + '\nreturn {hubBaseUrl,sysFromPath,appPrefix,ecosystemDir,sysUrl,applySysPath};')(loc, hist, doc, URL); api.hist = hist; api.doc = doc; return api; })();
}
let e = env('/solutions');
T('the Main page at /solutions is not a system address', e.sysFromPath() === null);
T('the PMS address /solutions-PMS opens the PMS', env('/solutions-PMS').sysFromPath() === 'hub' && env('/solutions-PMS.html').sysFromPath() === 'hub' && env('/solutions-pms').sysFromPath() === 'hub');
T('the old /ecosystem/PMS/ still opens the PMS', env('/ecosystem/PMS/').sysFromPath() === 'hub' && env('/ecosystem/PMS').sysFromPath() === 'hub');
T('the other systems keep their addresses', env('/ecosystem/Reach/').sysFromPath() === 'reach' && env('/ecosystem/Booking').sysFromPath() === 'book' && env('/ecosystem/Sales/').sysFromPath() === 'sales');
T('entering the PMS gives www.maha-hub.com/solutions-PMS', e.sysUrl('hub', { code: 'PAD01' }) === 'https://maha-hub.com/solutions-PMS?hotel=PAD01' && e.sysUrl('hub') === 'https://maha-hub.com/solutions-PMS');
T('Reach, Connect, Booking and Sales still go to /ecosystem/<System>/', e.sysUrl('reach') === 'https://maha-hub.com/ecosystem/Reach/' && e.sysUrl('book', { code: 'X' }) === 'https://maha-hub.com/ecosystem/Booking/?hotel=X');
e = env('/ecosystem/'); e.applySysPath('hub');
T('from the old address the bar moves to /solutions-PMS', e.hist.to === '/solutions-PMS' && e.doc.title === 'Maha PMS');
e = env('/solutions-PMS'); e.applySysPath(null);
T('back to the Main page the address is /solutions', e.hist.to === '/solutions' && e.doc.title === 'maha-hub / solutions');
e = env('/solutions/'); e.applySysPath(null);
T('/solutions/ already is the Main page: the bar is left alone', e.hist.to === null);
e = env('/solutions-PMS'); e.applySysPath('hub');
T('/solutions-PMS already is the PMS: the bar is left alone', e.hist.to === null);
e = env('/'); e.applySysPath('hub');
T('Maha systems keep /ecosystem/ under a sub-folder prefix too', env('/app/solutions-PMS').sysUrl('reach') === 'https://maha-hub.com/app/ecosystem/Reach/' && env('/app/solutions').sysUrl('hub') === 'https://maha-hub.com/app/solutions-PMS');
T('the hub base address drops the new names', env('/solutions-PMS').hubBaseUrl() === 'https://maha-hub.com/' && env('/solutions').hubBaseUrl() === 'https://maha-hub.com/' && env('/ecosystem/PMS/').hubBaseUrl() === 'https://maha-hub.com/');
T('the page is named solutions in the tab and the share card', /<title>maha-hub \/ solutions<\/title>/.test(src) && /rel="canonical" href="\/solutions"/.test(src));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
