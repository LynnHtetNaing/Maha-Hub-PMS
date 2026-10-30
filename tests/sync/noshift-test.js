/* No-shift sign-in and the hotel switcher: the logic that does not need the page.
     node tests/sync/noshift-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const a = src.indexOf('/* ---- No shift:'), b = src.indexOf('/* ---- end No shift ---- */');
if (a < 0 || b < 0) throw new Error('no-shift code not found');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const X = new Function(src.slice(a, b) + '\nreturn {noShiftVirtual,openCashierShifts,pickPayShift,noShiftSessionOk,switchChoices,shiftless,isFrontOffice};')();

/* the stand-in shift a person without a shift works under */
const v = X.noShiftVirtual({ userId: 'u7', at: 1000 }, { username: 'gm.one' }, '2026-10-12');
T('it is a virtual shift named "No shift", never opened, no cash', v.virtual === true && v.noShift === true && v.name === 'No shift' && v.openCash === 0 && v.status === 'open' && v.userName === 'gm.one' && v.bd === '2026-10-12');
T('its id cannot clash with a real shift id', /^ns-u7$/.test(v.id));
T('it works even if the person is not found', X.noShiftVirtual({ userId: 'u8' }, null, '2026-10-12').userName === '');

/* cashier shifts that can receive a payment */
const hotel = { shifts: [{ id: 's1', name: 'Morning', userName: 'ann', status: 'closed' }, { id: 's2', name: 'Afternoon', userName: 'bob', status: 'open' }, { id: 's3', name: 'Night', userName: 'cy', status: 'open' }] };
T('only open cashier shifts can receive a payment', X.openCashierShifts(hotel).map(s => s.id).join() === 's2,s3');
T('no open shift means a payment cannot be taken', X.openCashierShifts({ shifts: [{ status: 'closed' }] }).length === 0 && X.openCashierShifts({}).length === 0 && X.openCashierShifts(null).length === 0);
const open = X.openCashierShifts(hotel);
T('the chosen shift receives the payment', X.pickPayShift(open, 's3').id === 's3' && X.pickPayShift(open, 's2').id === 's2');
T('with one open shift (or an unknown choice) the first open shift is used', X.pickPayShift([open[0]], '').id === 's2' && X.pickPayShift(open, 'zzz').id === 's2');
T('nothing open gives no shift', X.pickPayShift([], 's2') === null && X.pickPayShift(null, 's2') === null);
T('a closed shift can never be picked', X.pickPayShift(open, 's1').id !== 's1');

/* a no-shift sign-in ends when the provider takes the setting away */
T('a no-shift session stays valid while the person is ticked', X.noShiftSessionOk({ noShift: true }, { noShift: true }) === true);
T('a no-shift session is refused once the tick is removed or the person is gone', X.noShiftSessionOk({ noShift: true }, { noShift: undefined, department: 'Front Office' }) === false && X.noShiftSessionOk({ noShift: true }, null) === false);
T('a normal shift session is not affected', X.noShiftSessionOk({ shiftId: 's1' }, { noShift: false }) === true && X.noShiftSessionOk({}, null) === true);

/* the switcher list */
const props = [{ code: 'YGN01', id: 'p2' }, { code: 'BKK01', id: 'p1' }, { code: 'MDL01', id: 'p3' }];
const names = { BKK01: 'Padauk Bangkok', YGN01: 'Padauk Yangon' };
const list = X.switchChoices(props, names, 'YGN01');
T('every hotel the person may open is listed, in code order', list.map(c => c.code).join() === 'BKK01,MDL01,YGN01');
T('the current hotel is marked and the names are shown', list.find(c => c.current).code === 'YGN01' && list[0].name === 'Padauk Bangkok' && list.filter(c => c.current).length === 1);
T('a hotel without a known name shows its code', list.find(c => c.code === 'MDL01').name === 'MDL01');
T('only the hotels passed in are listed (nothing extra)', X.switchChoices([], names, 'BKK01').length === 0 && X.switchChoices(null, null, 'BKK01').length === 0);

console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); /* only the Front Office department opens a shift */
T('Front Office opens a shift, others never (HK, F&B, management)', X.shiftless({ department: 'Front Office' }) === false && X.shiftless({ department: 'Housekeeping' }) === true && X.shiftless({ department: 'F&B' }) === true && X.shiftless({ department: 'Management' }) === true);
T('the no-shift tick still wins for a Front Office person', X.shiftless({ department: 'Front Office', noShift: true }) === true);
T('no department set: the position or preset decides (front desk opens a shift, housekeeping does not)', X.shiftless({ role: 'Front desk' }) === false && X.shiftless({ position: 'Front Office Supervisor' }) === false && X.shiftless({ role: 'Housekeeping' }) === true && X.shiftless({ role: 'Manager' }) === true);
T('a no-shift session of a person who has to open a shift is refused', X.noShiftSessionOk({ noShift: true }, { role: 'Front desk' }) === false && X.noShiftSessionOk({ noShift: true }, { department: 'Housekeeping' }) === true);
process.exit(fails ? 1 : 0);
