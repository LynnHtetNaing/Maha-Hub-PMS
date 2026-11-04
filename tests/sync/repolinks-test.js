/* Every symbolic link in the repository points to something that exists. A link to a folder that was moved or deleted makes the Cloudflare build fail
   ("Missing file or directory"), which blocks the merge.   node tests/sync/repolinks-test.js */
const { execSync } = require('child_process'), path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..', '..');
const run = c => execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 1e8 });
let fails = 0;
const files = run('git ls-files -s').split('\n').filter(l => l.startsWith('120000'));
const tracked = new Set(run('git ls-files').split('\n').filter(Boolean));
const dirs = new Set(); tracked.forEach(f => { let d = path.posix.dirname(f); while (d && d !== '.') { dirs.add(d); d = path.posix.dirname(d) } });
for (const l of files) {
  const f = l.split('\t')[1], target = run('git show HEAD:"' + f + '"').trim().split('\n')[0];
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f), target));
  const ok = tracked.has(resolved) || dirs.has(resolved) || fs.existsSync(path.join(root, resolved));
  console.log((ok ? 'PASS ' : 'FAIL ') + f + ' -> ' + target); if (!ok) fails++;
}
console.log(fails ? 'FAILED ' + fails : 'all ok'); process.exit(fails ? 1 : 0);
