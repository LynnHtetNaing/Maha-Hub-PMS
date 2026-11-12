/* Every Edge function must still parse after an edit (a broken string once made a function fail only at deploy time).
     node tests/sync/functions-syntax-test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..', '..', 'supabase', 'functions');
let strip = null; try { strip = require('node:module').stripTypeScriptTypes; } catch (e) { /* older Node */ }
if (!strip) { console.log('SKIP this Node cannot strip types'); process.exit(0); }
const files = []; for (const d of fs.readdirSync(root)) { const p = path.join(root, d); if (!fs.statSync(p).isDirectory()) continue; for (const f of fs.readdirSync(p)) if (f.endsWith('.ts')) files.push(path.join(p, f)); }
let fails = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8'), ok = true, why = '';
  try { s = strip(s, { mode: 'strip' }).replace(/^import .*$/gm, '').replace(/^export /gm, ''); new vm.Script('(async()=>{' + s + '
})'); } catch (e) { ok = false; why = String(e.message).split('
')[0]; }
  console.log((ok ? 'PASS ' : 'FAIL ') + path.relative(root, f) + (why ? ' | ' + why : '')); if (!ok) fails++;
}
process.exit(fails ? 1 : 0);
