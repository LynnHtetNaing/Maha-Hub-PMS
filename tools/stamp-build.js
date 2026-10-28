/* Writes the build stamp into ecosystem/index.html: a short hash of the whole file (with the stamp itself set to 0).
   The page and the "new version" check compare this stamp, so the bar only shows when the file really changed.
   Run it after every change:  node tools/stamp-build.js   (the test tests/sync/buildstamp-test.js fails if it is stale) */
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const f=path.join(__dirname,'..','ecosystem','index.html');
const RE=/<meta name="maha-build" content="[^"]*">/;
let raw=fs.readFileSync(f,'utf8');const crlf=raw.includes('\r\n');let s=raw.replace(/\r\n/g,'\n');
if(!RE.test(s))throw new Error('the maha-build meta tag is missing');
const stamp=crypto.createHash('sha1').update(s.replace(RE,'<meta name="maha-build" content="0">')).digest('hex').slice(0,10);
s=s.replace(RE,'<meta name="maha-build" content="'+stamp+'">');
fs.writeFileSync(f,crlf?s.replace(/\n/g,'\r\n'):s);console.log('build stamp',stamp);
