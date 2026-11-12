const fs=require('fs'),path=require('path');
const R=path.join(__dirname,'..','..')+path.sep;
const fail=m=>{console.log('FAIL',m);process.exit(1)};
const png=f=>{const b=fs.readFileSync(R+f);if(b.readUInt32BE(0)!==0x89504e47)fail(f+' is not a PNG');return {w:b.readUInt32BE(16),h:b.readUInt32BE(20),ct:b[25],buf:b}};
// the favicon.ico holds the CRM mark (the same mark as the tab icon of every Maha system)
const ico=fs.readFileSync(R+'favicon.ico');
if(ico.readUInt16LE(0)!==0||ico.readUInt16LE(2)!==1)fail('favicon.ico header');
{const off=ico.readUInt32LE(18),len=ico.readUInt32LE(14);if(!ico.slice(off,off+len).equals(fs.readFileSync(R+'icons/maha-mark-sq.png')))fail('favicon.ico is not the CRM mark');}
// phone icons are full squares (no transparent corners, which turn black on iPhone and Android)
for(const f of ['brand/pms/icon-180.png','brand/maha/pms-icon-180.png','brand/pms/icon-192-maskable.png','brand/pms/icon-512-maskable.png']){const p=png(f);if(p.w!==p.h)fail(f+' not square');if(p.ct!==6&&p.ct!==2)fail(f+' colour type');}
{const p=png('brand/pms/icon-180.png');if(p.w!==180)fail('apple touch icon must be 180');const q=png('brand/pms/icon-512-maskable.png');if(q.w!==512)fail('maskable 512')}
// the manifest gives the phone proper maskable icons
const man=JSON.parse(fs.readFileSync(R+'manifest.json','utf8'));
const mk=man.icons.filter(i=>i.purpose==='maskable').map(i=>i.src);
if(!mk.includes('brand/pms/app-icon-maskable-192.png')||!mk.includes('brand/pms/app-icon-maskable-512.png'))fail('manifest maskable icons');
if(man.icons.some(i=>i.purpose==='maskable'&&!/maskable/.test(i.src)))fail('a maskable entry still uses the rounded icon');
for(const i of man.icons)if(!fs.existsSync(R+i.src))fail('manifest icon missing: '+i.src);
// every icon a page points to exists
const pages=fs.readdirSync(R).filter(f=>f.endsWith('.html'));
for(const f of pages){const h=fs.readFileSync(R+f,'utf8');for(const m of h.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)){const p=m[1].replace(/^\//,'');if(!fs.existsSync(R+p))fail(f+' points to missing '+m[1])}}
console.log('icons ok');
