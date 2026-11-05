/* The provider has its own address: console.maha-hub.com. A provider cannot sign in on the PMS or another system address, and hotel staff cannot sign in on the console.
   node tests/sync/providerhost-test.js ecosystem/index.html */
const fs = require('fs'); const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };
T('a provider who signs in on any system address except the console is refused and signed out', src.includes("if(r.provider){if(onSplitHost()&&hostRole()!=='console'){if(MahaAuth.on())MahaAuth.signOut();err.textContent='The provider signs in at console.maha-hub.com"));
T('hotel staff on the console address are refused', src.includes("if(hostRole()==='console'){if(MahaAuth.on())MahaAuth.signOut();err.textContent='This address is for the provider only.'"));
T('the console address opens the provider sign-in', src.includes("if(hostRole()==='console')lgProvider=true;"));
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
