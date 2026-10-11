/* New reservation and Arrivals: typing a country or nationality, and the rules of the assign / block popup.
     node tests/sync/reservation-ui-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- Nationalities:'), b = src.indexOf('/* ---- end Room line ---- */');
if (a < 0 || b < 0) throw new Error('code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {NATIONS,NATION_ITEMS,natResolve,natOptions,roomLineDecide,comboFilter};')();
const R = X.natResolve;

/* the list */
T('the list covers the world (190+ countries) with a nationality each', X.NATIONS.length >= 190 && X.NATIONS.every(n => n.country && n.nat), String(X.NATIONS.length));
T('the typing list shows the nationality with its country', /<option value="Thai" label="Thailand">/.test(X.natOptions()) && /<option value="Korean" label="South Korea">/.test(X.natOptions()));
T('every country is only listed once', new Set(X.NATIONS.map(n => n.country)).size === X.NATIONS.length);

/* typing a country or a nationality */
for (const [typed, want] of [
  ['Thai', 'Thai'], ['thai', 'Thai'], ['THAI', 'Thai'], ['Thailand', 'Thai'], ['thailand', 'Thai'], ['  thailand  ', 'Thai'],
  ['Myanmar', 'Myanmar'], ['burma', 'Myanmar'], ['Burmese', 'Myanmar'],
  ['United Kingdom', 'British'], ['UK', 'British'], ['british', 'British'], ['England', 'British'],
  ['United States', 'American'], ['USA', 'American'], ['america', 'American'],
  ['South Korea', 'Korean'], ['Korea', 'Korean'], ['Korean', 'Korean'],
  ['Singapore', 'Singaporean'], ['Vietnam', 'Vietnamese'], ['Viet Nam', 'Vietnamese'], ['Laos', 'Lao'], ['Cambodia', 'Cambodian'],
  ['Germany', 'German'], ['france', 'French'], ['Japan', 'Japanese'], ['China', 'Chinese'], ['India', 'Indian'], ['Russia', 'Russian'],
  ['Netherlands', 'Dutch'], ['Holland', 'Dutch'], ['Philippines', 'Filipino'], ['New Zealand', 'New Zealander'],
  ['UAE', 'Emirati'], ['United Arab Emirates', 'Emirati'], ['Türkiye', 'Turkish'], ['Turkey', 'Turkish'], ["Côte d'Ivoire", 'Ivorian'], ['Cote d Ivoire', 'Ivorian'],
]) T('"' + typed + '" becomes ' + want, R(typed) === want, R(typed));
T('a short start that points to one nationality is completed ("germ" -> German)', R('germ') === 'German');
T('a start that fits several countries is left as typed ("united")', R('united') === 'united');
T('something unknown is kept as typed, nothing is lost', R('Martian') === 'Martian' && R('Zzz') === 'Zzz');
T('empty stays empty', R('') === '' && R(null) === '' && R(undefined) === '' && R('   ') === '');
T('a nationality that is already right is not changed', X.NATIONS.every(n => R(n.nat) === n.nat || R(n.nat) !== '') && R('Filipino') === 'Filipino');

/* the room popup: assign and block in one line */
const D = X.roomLineDecide;
let d = D({ room: null, block: null }, { room: '101', block: false });
T('assign a room to a booking with none', d.assign === '101' && !d.block && !d.unblock && !d.err);
d = D({ room: '101', block: null }, { room: '101', block: false });
T('nothing changed gives nothing to do', d.assign === null && !d.block && !d.unblock && !d.err);
d = D({ room: '101', block: null }, { room: '102', block: false });
T('change the room', d.assign === '102' && !d.block);
d = D({ room: '101', block: null }, { room: '101', block: true, reason: 'VIP wants this room' });
T('block the assigned room with a reason', d.block && d.block.room === '101' && d.block.reason === 'VIP wants this room' && d.assign === null && !d.err);
d = D({ room: '101', block: null }, { room: '101', block: true, reason: '   ' });
T('a block without a reason is refused', d.err === 'A block needs a reason.');
d = D({ room: null, block: null }, { room: '', block: true, reason: 'x' });
T('a block needs a room first', d.err === 'Choose a room before blocking it.');
d = D({ room: null, block: null }, { room: '105', block: true, reason: 'Owner' });
T('choose a room and block it in one go', d.assign === '105' && d.block && d.block.room === '105');
d = D({ room: '101', block: { reason: 'VIP' } }, { room: '102', block: true, reason: 'VIP' });
T('while blocked the room cannot be changed (the block stays, nothing moves)', d.assign === null && d.block === null && d.unblock === false && !d.err);
d = D({ room: '101', block: { reason: 'VIP' } }, { room: '101', block: false });
T('turning the block off clears it and keeps the room', d.unblock === true && d.assign === null && d.block === null);
d = D({ room: '101', block: { reason: 'VIP' } }, { room: '103', block: false });
T('turning the block off and choosing another room does both', d.unblock === true && d.assign === '103');

/* the drop-down list: what it shows while typing */
const items = X.NATION_ITEMS, F = X.comboFilter;
T('an empty box lists every country (scrollable list of the whole world)', F(items, '').length === items.length && items.length >= 190);
T('typing "tha" shows Thai first (Thailand)', F(items, 'tha')[0].value === 'Thai' && F(items, 'tha')[0].label === 'Thailand');
T('typing a country finds its nationality ("germany" -> German)', F(items, 'germany')[0].value === 'German');
T('typing a nationality finds it ("japan" -> Japanese)', F(items, 'japan')[0].value === 'Japanese');
T('what starts with the typing comes before what only contains it', (() => { const r = F(items, 'ko').map(x => x.value); return r.indexOf('Korean') >= 0 && r.indexOf('Korean') < r.indexOf('Slovak') || r.indexOf('Slovak') < 0; })());
T('accents and capitals do not matter', F([{ value: 'José Pérez #7', label: 'Spanish' }], 'JOSE')[0].value === 'José Pérez #7' && F(items, 'THAI')[0].value === 'Thai');
T('nothing matching gives an empty list', F(items, 'qqqq').length === 0);
const guests = [{ value: 'Somchai Rattanakul #1001', label: 'Thai' }, { value: 'Olivia Clarke #1002', label: 'British' }, { value: 'Kim Minjun #1003', label: 'Korean' }];
T('the guest search finds by any part of the name or by nationality', F(guests, 'clarke')[0].value.startsWith('Olivia') && F(guests, 'rattana').length === 1 && F(guests, 'korean')[0].value.startsWith('Kim'));
T('the guest search finds by the profile number', F(guests, '1003')[0].value.startsWith('Kim'));
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
