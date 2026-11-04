/* Transfer: tick the lines to move; settled lines stand out in Dark; the Reservation Back does not loop.
     node tests/sync/transfer-tick-test.js ecosystem/index.html */
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');let fails=0;
const T=(n,ok)=>{console.log((ok?'PASS ':'FAIL ')+n);if(!ok)fails++};
T('Dark: a settled line is green with a left bar, different from an open line',src.includes('html[data-mode=dark] tr.lset td,html[data-skin="modern"][data-mode=dark] tr.lset td{background:#14382c;color:#9fd9bf}')&&src.includes('tr.lset td:first-child{box-shadow:inset 3px 0 0 #3fbf8f}'));
T('Transfer lists the lines of the folio with tick boxes and a select-all box',src.includes('id="trAll"')&&src.includes('data-ck="${x.id}"')&&src.includes('Choose what to move from folio'));
T('the selected line starts ticked; with none selected every movable line is ticked',src.includes('const chosen=new Set((l&&movable(l)?[l]:folLines()).map(x=>x.id))'));
T('only ticked lines move, and nothing ticked blocks the button',src.includes('const moveSet=()=>folLines().filter(x=>chosen.has(x.id));')&&src.includes("id=\"trGo\" ${set.length?'':'disabled'}"));
T('the one-line / whole-folio switch is gone',!src.includes('id="trScope"')&&!src.includes('data-sc="folio"'));
T('Reservation Back steps back when it came from that page, so the list keeps no Back to the reservation',src.includes("const top=NAVSTACK[NAVSTACK.length-1];if(top&&top.v===b.dataset.go)goBack();else go(b.dataset.go)"));
process.exit(fails?1:0);
