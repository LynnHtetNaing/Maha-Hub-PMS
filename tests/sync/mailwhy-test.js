const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const i=src.indexOf('function mailWhy(code){'),j=src.indexOf('const PP={q:',i);
if(i<0||j<0)fail('mailWhy not found');
eval(src.slice(i,j)+';globalThis.W=mailWhy');
const has=(t,w)=>{if(!t.includes(w))fail('"'+t+'" should mention "'+w+'"')};
has(W('over_email_send_rate_limit'),'too many emails');
has(W('unexpected_failure'),'Resend');
has(W('email_address_invalid'),'address looks wrong');
has(W('something_new'),'something_new');
has(W(''),'Try again');
if(/@/.test(W('over_email_send_rate_limit')))fail('no address in the message');
// the reset button shows that reason
if(!src.includes("if(d&&d.invitation_sent===false){toast(mailWhy(d.invitation_error));return}"))fail('reset button does not show the reason');
console.log('mailwhy ok');
