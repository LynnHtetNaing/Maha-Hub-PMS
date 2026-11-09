/* The Maha loading screen: one shared file used by the PMS, the Provider console, the CRM and Billing.
     node tests/sync/loader-test.js */
const fs = require('fs');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const js = read('brand/maha/maha-loader.js'), eco = read('ecosystem/index.html'), crm = read('crm/index.html'), bill = read('billing/index.html'), sw = read('sw.js');
T('the loader file exists with show, hide and isShowing', ['show: function', 'hide: function', 'isShowing: function', 'window.MahaLoader = api'].every(s => js.includes(s)));
T('first opening (drawn in from the base, both sides) and the quick one (pop up, slide left, fast typing)', js.includes('first opening') && js.includes('function reveal') && js.includes("TYPE_MS = 55") && js.includes('translateX('));
T('the dots start only after the logo and the name are shown', js.includes("ring.classList.add('ml-on')") && js.includes('after(BUILD + 250, finish)') && js.includes('name.length * TYPE_MS + 250, finish'));
T('Light (sky, dark green) and Dark (night, gold, ivory), the sun stays in its own box above the logo and never moves', js.includes('PRESET') && js.includes("'#E3BC5E'") && js.includes('class="ml-lockbox"><div class="ml-sun">') && js.includes('bottom:calc(100% + 44px)'));
T('reduced motion shows the finished picture, a missing picture still shows the name and the dots, it never stays for ever', js.includes('prefers-reduced-motion') && js.includes('the picture could not load') && js.includes('after(45000'));
T('the two scene pictures have no sun of their own', ['light', 'dark'].every(m => !/cx="330" cy="250"/.test(read('brand/maha/scene-' + m + '-nosun.svg'))));
T('PMS and Provider console: the page loads the file and loadingShow / loadingHide use it (the old screen stays as the fallback), the name is Maha PMS or Maha Provider', eco.includes('<script src="/brand/maha/maha-loader.js"></script>') && eco.includes('MahaLoader.show({name:loadName(),dark:loadDark(),msg:msg||\'\'})') && eco.includes('return MahaLoader.hide()') && eco.includes("'Maha Provider':'Maha PMS'") && eco.includes('await loadingHide()}return r}'));
T('CRM: Maha CRM loading screen while it opens, hidden when the first page is ready', crm.includes('<script src="/brand/maha/maha-loader.js"></script>') && crm.includes("MahaLoader.show({name: 'Maha CRM', dark: false})") && crm.includes('if (window.MahaLoader) MahaLoader.hide();'));
T('Billing: Maha Billing loading screen instead of the Loading... card, hidden when the page or the sign-in is drawn, Light or Dark', bill.includes('<script src="/brand/maha/maha-loader.js"></script>') && bill.includes("MahaLoader.show({name:'Maha Billing'") && (bill.match(/MahaLoader\.hide\(\)/g) || []).length >= 2);
T('the PMS offline shell keeps the loader files', ['maha-loader.js', 'gate-gold.png', 'scene-light-nosun.svg', 'scene-dark-nosun.svg'].every(s => sw.includes(s)));
process.exit(fails ? 1 : 0);
