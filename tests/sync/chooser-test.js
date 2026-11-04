/* System selection page: Option 3 background, one frosted box, released systems as big buttons, the rest "Coming soon" */
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../../ecosystem/index.html','utf8');
assert(/<div class="eco-box">/.test(src),'box wrapper');
assert(/id="lgMode"/.test(src)&&/maha\.login\.mode/.test(src),'Light/Dark switch on the box');
assert(/Choose your system/.test(src),'title');
assert(src.includes('const pre=!u&&interactive;')&&src.includes('filter(s=>!pre||CHOOSER_OPEN.includes(s.kind))'),'only the two big buttons (PMS and Maha Sales) before sign-in');
assert(src.includes('s.kind===lgTargetSys&&CHOOSER_OPEN.includes(s.kind)))lgTargetSys=null;'),'Sales can be picked');
assert(/\.eco-shell\.eco-dk:not\(\.is-signin\) \.eco-box\{/.test(src),'dark box');
assert(/eco-brand::before{display:none}/.test(src),'old dark shade removed');
assert(!/eco-pmslogo" alt/.test(src),'no logo on the PMS button');
assert(/pagoda-mask\.png\) 50% 100%/.test(src),'pagoda artwork');
assert(/\.eco-card\[data-sys=sales\]\{background:#2457a6\}/.test(src)&&/\.eco-card\[data-sys=hub\]\{background:#0f7a58\}/.test(src),'PMS green, Sales blue');
console.log('chooser ok');
/* Provider console: every hotel action sits in one Action menu at the end of the row */
assert(/data-pvact="\$\{h\.code\}"[^>]*>Action ▾/.test(src)&&/class="pvacts" hidden/.test(src),'Action menu on the Hotels list');
console.log('hotels action ok');
/* sign-in box on the same background; after-sign-in pages are one box without the top bar; Dark pagoda soft */
assert(/.eco-shell.is-signin .eco-hero{display:none}/.test(src)&&src.includes('.eco-shell.is-signin::after{content:"";')&&src.includes('/brand/maha/scene-shape.svg'),'sign-in keeps the Main page background');
assert(/id="lgMode2"/.test(src),'Light/Dark button inside the sign-in box');
assert(src.includes('.eco-shell.eco-dk:not(.is-signin) .eco-hero::after{background:linear-gradient(180deg,#2f7f64,#16503b);opacity:.28}'),'softer Dark pagoda');
assert(src.includes('.eco-lockup img{width:66px;height:auto;filter:brightness(.4) saturate(3.4)'),'bigger, solid logo on the light box');
assert(/.selpg .sp-top{position:absolute;top:14px;right:18px;/.test(src)&&src.includes('.selpg .sp-top .sp-logo,.selpg .sp-right>span{display:none}')&&src.includes('.selpg .sp-body{width:min(1040px,100% - 28px);max-width:1040px;margin:auto;padding:28px 32px;background:#eceff0'),'after sign-in: no top bar, one box');
console.log('sign-in box ok');

/* the scene: famous buildings from the left, the pagoda and balloon at the right only */
assert(fs.existsSync(__dirname+'/../../brand/maha/scene-light.svg')&&fs.existsSync(__dirname+'/../../brand/maha/scene-dark.svg'),'scene pictures');
assert(src.includes('url(/brand/maha/scene-light.svg) 50% 100%/100% auto')&&src.includes('url(/brand/maha/scene-dark.svg) 50% 100%/100% auto'),'scene used on the pages');
assert(fs.readFileSync(__dirname+'/../../brand/maha/scene-shape.svg','utf8').includes('offset=".58"'),'one solid shade for buildings and pagoda; pagoda only on the right, its haze flowing left');
assert(src.includes('scene-light.svg) 50% 100%/100% auto no-repeat;opacity:.7')&&src.includes('scene-dark.svg) 50% 100%/100% auto no-repeat;opacity:.68'),'soft scene that does not compete with the box');
console.log('scene ok');/* one box on Select System / Select Property; more buildings in the middle */
assert(src.includes('.selpg .sp-body:has(.sp-sheet),.selpg.dark .sp-body:has(.sp-sheet){background:none;box-shadow:none;padding:0}')&&src.includes('.selpg .sp-card.sp-sheet{background:#eceff0'),'Select System is one box, not two');
assert(src.includes('.selpg>*{position:relative;z-index:2}'),'the box sits above the scene');
console.log('one box ok');
/* the sea strip stays at the bottom of the expiry page; Frontend and Backend are large tiles */
assert(src.includes('.selpg::after,.selpg.sp-expbg::after{z-index:0;top:0;bottom:0;height:auto}'),'sea strip at the bottom');
assert(src.includes('.selpg .sp-sheet .sp-sys{grid-template-columns:repeat(2,minmax(0,1fr));max-width:780px')&&src.includes('.selpg .sp-sheet .sp-tile{min-height:250px'),'large Frontend and Backend tiles');
console.log('tiles ok');
assert(src.includes('.selpg .sp-tile::before,.selpg .sp-tile::after{display:none}'),'Frontend and Backend tiles have no logo shade');
console.log('clean tiles ok');
