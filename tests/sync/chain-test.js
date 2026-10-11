/* Chains: code rules, which chain a hotel is in, which hotels a person may open, and the entry copied into another hotel.
     node tests/sync/chain-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Chains:'), b = src.indexOf('/* ---- end Chains ---- */');
if (a < 0 || b < 0) throw new Error('chain code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {chainCodeNormalize,chainCodeOk,chainLabel,chainOfHotel,chainAccessOf,chainUserCopy};')();

/* chain code: 6 to 12 letters or numbers */
for (const c of ['PADAUK2026', 'abc123', ' padauk2026 ', 'ABCDEF', '123456', 'ABCDEFGHIJKL']) T('code accepted: "' + c + '"', X.chainCodeOk(c));
for (const c of ['', 'ABC12', 'ABCDEFGHIJKLM', 'PADAUK-2026', 'PADAUK 2026', 'PADAUK_26', 'ÅBCDEF12', null, undefined, '1234567890123'])
  T('code refused: ' + JSON.stringify(c), !X.chainCodeOk(c));
T('a code is tidied to upper case without spaces around it', X.chainCodeNormalize('  padk2026 ') === 'PADK2026');
T('the chain label shows name and code', X.chainLabel({ name: 'Padauk Hotel Group', chain_code: 'PADK2026' }) === 'Padauk Hotel Group (PADK2026)' && X.chainLabel(null) === '');

/* which chain a hotel is in */
const info = {
  chains: [
    { name: 'Padauk', chain_code: 'PADK2026', hotels: [{ property_code: 'BKK01' }, { property_code: 'YGN01' }] },
    { name: 'Lotus', chain_code: 'LOTUS2026', hotels: [{ property_code: 'MDL01' }] }
  ],
  access: [
    { username: 'gm.one', property_code: 'BKK01', role: 'staff', active: true },
    { username: 'gm.one', property_code: 'YGN01', role: 'staff', active: true },
    { username: 'gm.one', property_code: 'OLD01', role: 'staff', active: false },
    { username: 'fd.two', property_code: 'BKK01', role: 'staff', active: true }
  ]
};
T('a hotel finds its chain', X.chainOfHotel(info, 'YGN01').chain_code === 'PADK2026' && X.chainOfHotel(info, 'MDL01').chain_code === 'LOTUS2026');
T('a stand-alone hotel has no chain', X.chainOfHotel(info, 'ZZZ01') === null && X.chainOfHotel(null, 'BKK01') === null && X.chainOfHotel({}, 'BKK01') === null);
T('a person opens exactly the hotels that were ticked and are active', [...X.chainAccessOf(info, 'gm.one')].sort().join() === 'BKK01,YGN01', [...X.chainAccessOf(info, 'gm.one')].join());
T('someone with one hotel opens one hotel', [...X.chainAccessOf(info, 'fd.two')].join() === 'BKK01');
T('an unknown person, or no data, opens nothing', X.chainAccessOf(info, 'nobody').size === 0 && X.chainAccessOf(null, 'gm.one').size === 0);

/* the copy for another hotel of the chain */
let n = 100;
const dep = { mk: (id, un, name, role, pw) => ({ id, username: un, name, role, hash: 'h:' + pw, perms: ['x'], systems: { hub: true }, active: true, owner: false }), id: () => 'u' + (++n), rand: () => 'secret' + n };
const srcUser = { id: 'u1', username: 'gm.one', name: 'General Manager', role: 'Manager', position: 'General Manager', perms: ['res.create', 'rate', 'reports'], systems: { hub: true, connect: false }, noShift: true, owner: true, protected: true, hash: 'ORIGINAL' };
const c = X.chainUserCopy(srcUser, dep);
T('the copy keeps who they are and starts with the same permissions', c.username === 'gm.one' && c.name === 'General Manager' && c.role === 'Manager' && c.position === 'General Manager' && c.perms.join() === 'res.create,rate,reports');
T('the copy is a separate object, so changing one hotel never changes the other', c.perms !== srcUser.perms && c.systems !== srcUser.systems && (c.perms.push('extra'), srcUser.perms.length === 3));
T('the copy keeps the No-shift setting', c.noShift === true && !X.chainUserCopy({ ...srcUser, noShift: undefined }, dep).noShift);
T('the copy gets its own id and its own random secret, never the original password', c.id !== srcUser.id && c.hash !== 'ORIGINAL' && /^h:secret/.test(c.hash));
T('the protected owner flags are not copied to the other hotel', !c.protected && !c.owner);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
