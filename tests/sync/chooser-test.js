/* System selection page: Option 3 background, one frosted box, released systems as big buttons, the rest "Coming soon" */
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../../ecosystem/index.html','utf8');
assert(/<div class="eco-box">/.test(src),'box wrapper');
assert(/id="lgMode"/.test(src)&&/maha\.login\.mode/.test(src),'Light/Dark switch on the box');
assert(/Choose your system/.test(src),'title');
assert(/const pre=!u&&interactive;/.test(src)&&/filter\(s=>!pre\|\|s\.released\)/.test(src),'only released systems as big buttons before sign-in');
assert(/s\.kind===lgTargetSys&&s\.released\)\)lgTargetSys=null/.test(src),'Sales can be picked');
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
assert(/\.eco-shell\.is-signin \.eco-hero\{display:none\}/.test(src)&&/\.eco-shell\.is-signin::after\{content:"";[^}]*pagoda-mask/.test(src),'sign-in keeps the Main page background');
assert(/id="lgMode2"/.test(src),'Light/Dark button inside the sign-in box');
assert(src.includes('.eco-shell.eco-dk:not(.is-signin) .eco-hero::after{background:#8fe0bf;opacity:.08}'),'softer Dark pagoda');
assert(src.includes('.eco-lockup img{width:66px;height:auto;filter:brightness(.4) saturate(3.4)'),'bigger, solid logo on the light box');
assert(/.selpg .sp-top{position:absolute;top:14px;right:18px;/.test(src)&&src.includes('.selpg .sp-top .sp-logo,.selpg .sp-right>span{display:none}')&&src.includes('.selpg .sp-body{width:min(1040px,100% - 28px);max-width:1040px;margin:auto;padding:28px 32px;background:#eceff0'),'after sign-in: no top bar, one box');
console.log('sign-in box ok');

/* the scene: famous buildings from the left, the pagoda and balloon at the right only */
assert(fs.existsSync(__dirname+'/../../brand/maha/scene-light.svg')&&fs.existsSync(__dirname+'/../../brand/maha/scene-dark.svg'),'scene pictures');
assert(src.includes('url(/brand/maha/scene-light.svg) 50% 100%/100% auto')&&src.includes('url(/brand/maha/scene-dark.svg) 50% 100%/100% auto'),'scene used on the pages');
assert(src.includes('linear-gradient(90deg,transparent 72%,#000 80%)'),'pagoda only on the right');
console.log('scene ok');