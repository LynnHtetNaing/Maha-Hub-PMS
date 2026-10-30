/* Room Grid top band: arrows, one date box with a period calendar (max 35 days), (i) sign, room type under the room number, first name on one-night bars.
     node tests/sync/gridtop-test.js ecosystem/index.html */
const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok,x)=>{console.log((ok?'PASS ':'FAIL ')+n+(x?' | '+x:''));if(!ok)fails++};
const a=src.indexOf("VIEWS['fo.grid']=el=>{"),b=src.indexOf("\nVIEWS['",a+10),grid=src.slice(a,b>0?b:a+30000);
T('no From / To / Search any more',!grid.includes("ufDate('gFrom'")&&!grid.includes('id="gSearch"')&&!grid.includes("bindDatePick(el)"));
T('arrows: back/forward by the days shown and by 30',grid.includes("rgGo(addD(gridFrom,-N))")&&grid.includes("rgGo(addD(gridFrom,N))")&&grid.includes("addD(gridFrom,-30)")&&grid.includes("addD(gridFrom,30)"));
T('default view: yesterday + 14 days (7 on a phone), box shows today',grid.includes("gridFrom=addD(H.set.bd,-1);gridTo=addD(gridFrom,MOB_Q.matches?6:13)")&&grid.includes("fd(addD(gridFrom,1))"));
T('period longer than 35 days is refused with a red note',/const RG_MAX=35/.test(src)&&grid.includes('if(n>RG_MAX){$(\'#gWarn\',el).hidden=false;')&&grid.includes('The most you can view is ${RG_MAX} days'));
T('legend: same nine notes, in the top band, one line or 5 + 4',(grid.match(/<span><i class="[^"]+"><\/i>|<span><i class="rgwarn">/g)||[]).length===9&&src.includes('grid-template-columns:repeat(5,max-content)')&&src.includes('@container (min-width:1220px)'));
T('legend is no longer under the grid',!grid.includes('<div class="legend rglegend">'));
T('room column: number, (i) sign only for blocks in view, full room type name',grid.includes('data-rginfo')&&grid.includes('rgBlocks(rm,gridFrom,gridTo).length')&&grid.includes('${esc(rgTypeName(rm.type))}'));
T('(i) opens a box with kind, dates, reason and Close',src.includes("rgInfoBox(rm,list)")&&src.includes('data-rgx')&&src.includes('<span>Reason</span>'));
T('one-night bar shows the first name',grid.includes('(r-l)*N<=1.01&&G(b.guestId).first?G(b.guestId).first:G(b.guestId).last'));
T('a day is at least 72px wide (the grid scrolls sideways instead of squeezing names)',grid.includes('min-width:${MOB_Q.matches?0:150+N*72}px'));
T('room grid keeps working: type and floor change the grid at once',grid.includes("$('#gType',el).onchange=()=>{GF.type=")&&grid.includes("$('#gFloor',el).onchange=()=>{GF.floor="));
const i=src.indexOf('function rgBlocks('),j=src.indexOf('function rgInfoBox(',i);
const rgBlocks=new Function('return '+src.slice(i,j).replace(/^function rgBlocks/,'function'))();
const rm={ooo:{kind:'OI',from:'2026-11-05',to:'2026-11-08',reason:'Repair'},softHold:{from:'2026-12-01',to:'2026-12-03',reason:'Group'}};
T('blocks in view: OI shown, a later soft block not',(()=>{const x=rgBlocks(rm,'2026-11-01','2026-11-14');return x.length===1&&x[0].kind==='OI'&&x[0].why==='Repair'})());
T('blocks in view: none when the dates are outside',rgBlocks(rm,'2026-11-20','2026-11-30').length===0);
T('the page never scrolls on Room Grid: the table takes the height left in the window and scrolls inside itself',grid.includes('gs.style.maxHeight=gs.style.height=')&&grid.includes('over>0')&&grid.includes("window.addEventListener('resize',fit)"));
T('date box has no calendar icon; the Period search box has it and works in two steps (first date, then last date, then search)',grid.includes('class="rgdbox rgdshow" id="gDate"')&&grid.includes('id="gPer"')&&grid.includes('if(!gridPerFirst){gridPerFirst=day')&&grid.includes('gridCustom=true;gridFrom=lo;gridTo=hi;render()')&&src.includes('function rgDayPicker(')&&src.includes('close();done(t)'));
T('filters stay on one line (shorter when the menu is open, longer when closed)',src.includes('.rgl1{display:flex;flex-wrap:nowrap'));
T('phone: 7 days, smaller text, filters wrap, legend in 3 columns', src.includes('@media (max-width:700px){\n .rgband{padding:8px') && src.includes('.gridwrap.rg{min-width:0!important}') && src.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
T('the page does not scroll on Room Grid (the table does)', src.includes('html:has(.gridscroll),html:has(.gridscroll) body{overflow:hidden}'));
/* hover effects only where there is a mouse: every :hover style rule sits inside @media (hover:hover) */
{
  const css = (src.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n');
  let bad = 0, depthHover = [], i = 0, d = 0;
  const stack = [];
  for (let k = 0; k < css.length; k++) {
    const c = css[k];
    if (c === '{') { const pre = css.slice(Math.max(0, css.lastIndexOf('}', k - 1) + 1, css.lastIndexOf('{', k - 1) + 1, css.lastIndexOf(';', k - 1) + 1), k); stack.push(pre); if (!/^\s*@/.test(pre) && pre.includes(':hover') && !stack.slice(0, -1).some(p => /@media \(hover:hover\)/.test(p))) bad++; }
    else if (c === '}') stack.pop();
  }
  T('every :hover rule sits inside @media (hover:hover) and a tap shows no grey flash', bad === 0 && src.includes('html{-webkit-tap-highlight-color:transparent}'), bad ? bad + ' outside' : '');
}
T('Guest Profile: the dates and RM + room number wrap as units, never RM alone at the end of a line', src.includes('<span class="nwr">${fd(x.cur.arr)}–${fd(x.cur.dep)}</span>') && src.includes("<span class=\"nwr\">RM '+esc(x.cur.room)+'</span>") && src.includes('.nwr{white-space:nowrap}'));
process.exit(fails ? 1 : 0);
