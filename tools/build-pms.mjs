/* Builds the published PMS page from the readable source.
   Source (kept private, never published):  src/pms.source.html
   Output (published):                       ecosystem/index.html
   What it does: removes every comment, packs the page, and shortens the names inside functions.
   It does NOT change what the system does. Run:  node tools/build-pms.mjs   (from the repo root)
   Add  --check  to only verify that ecosystem/index.html is up to date (used by the tests). */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, 'package.json'));
const { minify } = require('html-minifier-terser');
const SRC = join(root, 'src', 'pms.source.html'), OUT = join(root, 'ecosystem', 'index.html');
const src = readFileSync(SRC, 'utf8').replace(/^﻿/, '');
const out = await minify(src, {
  removeComments: true,
  collapseWhitespace: true,
  conservativeCollapse: true,
  minifyCSS: true,
  minifyJS: { compress: { passes: 1, drop_console: false }, mangle: { toplevel: false }, format: { comments: false } },
  ignoreCustomFragments: [/<%[\s\S]*?%>/],
});
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(OUT, 'utf8'); } catch (e) { /* missing */ }
  if (cur.replace(/\r\n/g, '\n') !== out.replace(/\r\n/g, '\n')) { console.error('ecosystem/index.html is out of date. Run: node tools/build-pms.mjs'); process.exit(1); }
  console.log('ecosystem/index.html is up to date.');
} else {
  writeFileSync(OUT, out);
  console.log('Built ecosystem/index.html:', Buffer.byteLength(src), '->', Buffer.byteLength(out), 'bytes');
}
