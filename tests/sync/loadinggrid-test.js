/* Loading screen grid: the same fine lines, lit by a ring of light from the centre (10% at most).
     node tests/sync/loadinggrid-test.js ecosystem/index.html */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let fails = 0;
const T = (n, ok, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' | ' + x : '')); if (!ok) fails++; };
T('the fixed grid of the loading screen is now drawn by a canvas; the old line pattern is gone', src.includes('<canvas class="mh-grid"') && /\.mh-grid\{position:absolute;inset:0;width:100%;height:100%;-webkit-mask-image:radial-gradient\(60% 55% at 50% 45%/.test(src) && !src.includes('.mh-boot::after{'));
T('same grid: 44px squares, 3.5% white lines', src.includes('S=44,PEAK=0.10') && src.includes("x.strokeStyle='rgba(255,255,255,.035)'"));
T('the light spreads from the centre, lights only the lines of each square, at most 10%', src.includes('Math.hypot(cx-mx,cy-my)') && src.includes('x.strokeRect(cx*S+.5,cy*S+.5,S,S)') && src.includes('(Math.min(1,a)*PEAK)') && !/fillRect\(cx\*S/.test(src));
T('gold near the centre, green further out', src.includes("dist/maxR<.55?'198,167,106':'127,214,189'"));
T('reduced motion: only the fixed lines, no animation; the animation stops when the screen is gone', src.includes("matchMedia('(prefers-reduced-motion:reduce)').matches)return;") && src.includes('if(tok!==_ldgTok||!cv.isConnected)return;'));
T('everything else on the loading screen is unchanged (sweep, rings, pulse, logo, bar)', src.includes('.mh-boot::before{') && src.includes('.mh-orb b{') && src.includes('.mh-bar i{') && src.includes('class="mh-bar"'));
process.exit(fails ? 1 : 0);
