/* One opening float per shift (strict) and the shift float screen (flexible).
     node tests/sync/shiftfloat-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
T('floats are hotel data that syncs', src.includes("MS_KEYS={shiftFloats:'k',") && src.includes('h.shiftFloats=Array.isArray(h.shiftFloats)?h.shiftFloats:[]'));
T('the float belongs to the first shift of its group, so it is counted once in the expected cash', src.includes('function sfHolder(h,s)') && src.includes('function sfOpenOf(h,s)') && src.includes('open=r2((s.openCash||0)+sfOpenOf(H,s))'));
T('strict sign-in: the first number typed is the float; a different number is refused without saying the recorded amount', src.includes('const fl=sfRec(h,grp.key,true);fl.open=typed') && src.includes("This does not match the opening float of the '+lgShift+' shift. Count the drawer again and type the same amount.") && !/does not match the opening float[^']*\$\{?grp\.open/.test(src));
T('strict sign-in: the cash box can not be skipped; a person with an unclosed shift continues it without typing cash', src.includes("Enter your opening cash (type 0 if the drawer is empty).") && src.includes("const flexS=ruleOnStrict(h,'flexibleShiftLogin');let s=h.shifts.find(x=>x.userId===u.id&&x.status==='open'&&(!flexS||x.name===lgShift));"));
T('after the shift is closed the next sign-in is a first sign-in again (a new group)', src.includes('while((h.shiftFloats||[]).some(x=>x.k===sfKeyOf(bd,name,n))'));
T('strict close: one count for the whole shift, everyone is closed with it, each keeps their own receipts', src.includes("Closed with the shift by '+user().name") && src.includes('peers.forEach((o,i)=>') && src.includes('Whole ${esc(s.name)} shift'));
T('flexible: no float at sign-in, the float is added in My Shift & Cashier and amounts for one shift add up', src.includes("$('#cashWrap').hidden=!!open||!!flexR;") && src.includes("if(!flexS){const ocW=$('#cashWrap')") && src.includes('fr.open=r2(before+o)') && src.includes(" shift float already has '+m2(before)+'. Your '"));
T('flexible: the float screen is only there when the rule is on', src.includes("const sfPanel=flexNow?`<div class=\"panel\"><div class=\"ph\">Shift float</div>"));
process.exit(fails ? 1 : 0);
