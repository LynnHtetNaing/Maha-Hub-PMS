/* System selection page: Option 3 background, one frosted box, released systems as big buttons, the rest "Coming soon" */
const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../../ecosystem/index.html','utf8');
assert(/<div class="eco-box">/.test(src),'box wrapper');
assert(/id="lgMode"/.test(src)&&/maha\.login\.mode/.test(src),'Light/Dark switch on the box');
assert(/Choose your system/.test(src),'title');
assert(/const pre=!u&&interactive;/.test(src)&&/filter\(s=>!pre\|\|s\.released\)/.test(src),'only released systems as big buttons before sign-in');
assert(/s\.kind===lgTargetSys&&s\.released\)\)lgTargetSys=null/.test(src),'Sales can be picked');
assert(/\.eco-shell\.eco-dk:not\(\.is-signin\) \.eco-box\{/.test(src),'dark box');
assert(/pagoda-mask\.png\) 50% 100%/.test(src),'pagoda artwork');
assert(/\.eco-card\[data-sys=sales\]\{background:#2457a6\}/.test(src)&&/\.eco-card\[data-sys=hub\]\{background:#0f7a58\}/.test(src),'PMS green, Sales blue');
console.log('chooser ok');
