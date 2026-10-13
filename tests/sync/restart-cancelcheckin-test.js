/* Restart rule (1 hour) and Cancel Check-In.
     node tests/sync/restart-cancelcheckin-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < 0) throw new Error('code not found: ' + a); return src.slice(i, j); };
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const R = new Function(cut('/* ---- Restart rule:', '/* ---- end Restart rule') + '\nreturn {RESTART_MS,restartDue};')();
const C = new Function(cut('/* ---- Cancel check-in:', 'async function cancelCheckIn(B)') + '\nreturn {CCI_BLOCK_MSG,cancelCheckInBlock,applyCancelCheckIn};')();
const H1 = 3600000, now = 1e12;

T('the restart limit is exactly 1 hour', R.RESTART_MS === H1);
T('59 minutes without activity: no restart', !R.restartDue(now - 59 * 60000, now));
T('1 hour without activity: restart', R.restartDue(now - H1, now));
T('a laptop closed overnight: restart when it wakes', R.restartDue(now - 9 * H1, now));
T('active a moment ago: no restart', !R.restartDue(now - 5000, now));
T('no saved time at all never restarts by mistake', !R.restartDue(0, now));

const B = (o) => Object.assign({ status: 'inhouse', room: '101', lines: [], bkType: 'FD', checkinDate: '2026-10-12', checkinTime: 5, checkinUser: 'u', statusDate: '2026-10-12' }, o);
T('in-house with nothing posted can cancel the check-in', C.cancelCheckInBlock(B()) === '');
T('a room charge, post or deposit blocks it with the exact message', C.cancelCheckInBlock(B({ lines: [{ kind: 'room', amt: 1500 }] })) === 'Room with Post/Payment cannot cancel check-in');
T('a deposit line blocks it', C.cancelCheckInBlock(B({ lines: [{ kind: 'pay', amt: -500 }] })) === C.CCI_BLOCK_MSG);
T('a guest not in-house cannot cancel', C.cancelCheckInBlock(B({ status: 'confirmed' })) !== '' && C.cancelCheckInBlock(B({ status: 'out' })) !== '');
const rm = { hk: 'clean', hkOcc: 'occ' }, b = B();
C.applyCancelCheckIn(b, rm);
T('the reservation goes back to Reservation (confirmed) and the check-in stamps are cleared', b.status === 'confirmed' && b.checkinDate === null && b.checkinTime === null && b.checkinUser === null, JSON.stringify(b));
T('the room becomes vacant dirty (VD), staff make it VC by hand', rm.hk === 'dirty' && rm.hkOcc === 'vac');
const f = B({ bkType: 'FT' }); C.applyCancelCheckIn(f, null);
T('a tentative (FT) booking goes back to tentative', f.status === 'tentative');
console.log(fails ? ('\n' + fails + ' FAILED') : '\nALL PASSED'); process.exit(fails ? 1 : 0);
