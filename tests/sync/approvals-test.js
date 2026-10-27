const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('cut '+a);return src.slice(i,j)};
let U,H;const can=p=>(U.perms||[]).includes(p);const user=()=>U;
eval(cut('function canApprove()','function queueApproval(')+';globalThis.T={canApprove,canDecide,approvalBig,approvalsForMe,approvalLevel}');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
H={set:{approvalLimits:{hod:5000,mgr:50000}},users:[{id:'o',owner:true},{id:'m',role:'Manager'},{id:'h',role:'HOD'}],approvals:[]};
const ap=(by,amt)=>({id:'x'+by+amt,status:'pending',by:by,byId:by,amt});
// a front desk person (no Approve) cannot decide
U={id:'f',name:'f',role:'Front desk',perms:['post']};
if(T.canDecide(ap('h',100)).ok)fail('front desk approved');
// HOD: own request blocked, small ok, over limit blocked
U={id:'h',name:'h',role:'HOD',perms:['approve']};
if(T.canDecide(ap('h',100)).ok)fail('HOD approved own');
if(!T.canDecide(ap('f',4000)).ok)fail('HOD small');
if(T.canDecide(ap('f',6000)).ok)fail('HOD over limit');
// Manager
U={id:'m',name:'m',role:'Manager',perms:['approve']};
if(!T.canDecide(ap('f',49999)).ok)fail('Mgr within');
if(T.canDecide(ap('f',60000)).ok)fail('Mgr over');
if(T.canDecide(ap('m',1)).ok)fail('Mgr own');
// Owner has no limit but not own
U={id:'o',name:'o',role:'Manager',perms:['approve']};
if(!T.canDecide(ap('f',900000)).ok)fail('Owner big');
if(T.canDecide(ap('o',1)).ok)fail('Owner own');
// provider in hotel: no limit
U={id:'p',name:'p',role:'Provider',isProv:true,perms:['approve']};
if(!T.canDecide(ap('f',900000)).ok)fail('Prov big');
if(!T.approvalBig(ap('f',60000))||T.approvalBig(ap('f',10)))fail('big flag');
console.log('approvals ok');
