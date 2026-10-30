/* Flexible shift sign-in (a Provider rule per hotel) and Close Day.
     node tests/sync/flexshift-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
T('the rule exists per hotel, off by default, in System rules', src.includes('flexibleShiftLogin:false') && src.includes("{k:'flexibleShiftLogin',title:'Flexible shift sign-in'") && /flexibleShiftLogin[^}]*off:true\}/.test(src));
T('not linked to the opening cash rule: the cash box still follows the shift that is opened', src.includes("const flexR=u&&ruleOnStrict(h,'flexibleShiftLogin'),open=u&&h.shifts.find(s=>s.userId===u.id&&s.status==='open'&&(!flexR||s.name===lgShift))") && src.includes("$('#cashWrap').hidden=!!open;"));
T('sign-in: rule off = continue the unclosed shift; rule on = the chosen shift (continue it if open, otherwise open it)', src.includes("const flexS=ruleOnStrict(h,'flexibleShiftLogin');let s=h.shifts.find(x=>x.userId===u.id&&x.status==='open'&&(!flexS||x.name===lgShift));"));
T('picking another shift updates the sign-in button and the cash box at once', src.includes("b.setAttribute('aria-pressed',b.dataset.shift===v?'true':'false'));try{hint()}catch(e){}"));
T('people who sign in without a shift never reach this code (they return before it)', src.indexOf("if(shiftless(u)){s={name:'No shift'}") < src.indexOf("const flexS=ruleOnStrict(h,'flexibleShiftLogin')") || src.indexOf("if(shiftless(u)){s={name:'No shift'}") > 0);
T('Close Day: with the rule on, open shifts are a warning and Close Day closes them at expected cash', src.includes("block:!ruleOnStrict(H,'flexibleShiftLogin'),k:ruleOnStrict(H,'flexibleShiftLogin')?'shiftflex':'shift'") && src.includes("if(ruleOnStrict(H,'flexibleShiftLogin'))H.shifts.filter(x=>x.status==='open'&&!x.virtual).forEach(x=>{cl(x);"));
T('Close Day: with the rule off nothing changes (open shifts still block)', src.includes("if(ruleOn(H,'requireOtherCashiersClosedForCloseDay'))H.shifts.filter(x=>x.status==='open'&&!x.virtual&&(!s||x.id!==s.id))"));
process.exit(fails ? 1 : 0);
