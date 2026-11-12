/* Enewletter templates: ten fixed templates (text kept by the CEO), the boxes fill them, "Plain" is the free editor; the Event invitation and the
   Gentle reminder carry answer links (a Meeting / a Follow up is made by crm-reply); the answers are listed under Replies.
     node tests/sync/enewstpl-test.js crm/index.html */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const crm = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const send = rd('supabase/functions/crm-send-mail/index.ts'), reply = rd('supabase/functions/crm-reply/index.ts'), worker = rd('workers/maha-hub-pms/src/index.js'), wr = rd('wrangler.toml');
let fails = 0; const T = (n, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fails++; };

/* ---- the catalog, run for real ---- */
const i = crm.indexOf("const ENT_BTN"), j = crm.indexOf("const ENT_THUMB");
const recs = [];
const code = crm.slice(i, j);
const api = new Function('K', 'Auth', 'fdate', 'esc', 'document', code + '\nreturn {ENEWS_TPL, entGet, entList, entVals, entRender, entSubject, entMissing, entOptions, entFields};')(
  k => k === 'enews_tpl' ? recs : [], { who: () => 'Lynn' }, d => d ? 'D(' + d + ')' : '', s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), {});
const { ENEWS_TPL, entGet, entList, entVals, entRender, entSubject, entMissing, entOptions, entFields } = api;
T('eleven templates', ENEWS_TPL.length === 11 && ['news', 'offer', 'update', 'invite', 'thanks', 'follow', 'meeting', 'season', 'notice', 'results', 'letter'].every(id => ENEWS_TPL.some(t => t.id === id)));

/* every [type here] in the text is a box; the same wording is one box; date and time words give a calendar and a clock */
const fl = entFields('<p>[Your name] and [your name] <a href="https://x.com/[no]">x</a> [Event date] [Event time] [Your news] [Hotel name]</p>', 'Hi [Holiday]');
T('boxes come from the [brackets]: same wording is one box, a bracket inside a tag is left alone, date/time/long text get their own kind', fl.map(f => f.k + ':' + f.type).join('|') === 'your name:text|event date:date|event time:time|your news:area|hotel name:text|holiday:text');

const sendSrc = send.replace(/\r\n/g, '\n');
const clean = sendSrc.split('// --- clean:start')[1].split('// --- clean:end')[0].replace(/^[^\n]*\n/, '');
const { cleanHtml } = new Function(clean.replace(/: (any|string)(?=[,)\s=])/g, '') + '\nreturn { cleanHtml };')();

let leftOver = [], linkBad = [], styleLost = [], noBox = [];
for (const t of ENEWS_TPL.map(x => entGet(x.id))) {
  const v = entVals(t, null);
  (t.fields || []).forEach(f => { v[f.k] = f.type === 'date' ? '2026-12-01' : f.type === 'time' ? '10:00' : (v[f.k] || 'X' + f.k.replace(/\W/g, '')); });
  if (!t.fields.length) noBox.push(t.id);
  const html = entRender(t, v), left = (html.match(/\[[^\]<>]{2,80}\]/g) || []).concat((html.match(/\{\{[a-zA-Z0-9]+\}\}/g) || []).filter(x => x !== '{{hotel}}'));
  if (left.length) leftOver.push(t.id + ':' + left.join(','));
  const opts = entOptions(t, v);
  if (t.kind && !opts.length) linkBad.push(t.id + ':nooptions');
  opts.forEach(o => { if (!html.includes('https://replace.me/' + o.k)) linkBad.push(t.id + ':' + o.k); });
  const c = cleanHtml(html);
  if (/background-color:#0A3020/.test(html) && !/background-color:#0A3020/.test(c)) styleLost.push(t.id);
  if (opts.length && !opts.every(o => c.includes('https://replace.me/' + o.k))) linkBad.push(t.id + ':cleaned');
  if (entRender(t, v, true).includes('replace.me')) linkBad.push(t.id + ':preview');
}
T('every template has boxes: ' + noBox.join(' '), noBox.length === 0);
T('filled in, no [bracket] or {{place}} is left except {{hotel}}: ' + leftOver.join(' '), leftOver.length === 0);
T('every answer button has its link, before and after cleaning, and the preview has none: ' + linkBad.join(' '), linkBad.length === 0);
T('the colours and boxes of the templates survive the cleaning of the mail function: ' + styleLost.join(' '), styleLost.length === 0);

const inv = entGet('invite'), iv = { 'event name': 'Demo day', 'event date': '2026-12-05', 'event time': '10:00', 'place or online link': 'Online', 'length, for example 30 minutes': '30 min', 'your name': 'Lynn' };
const io = entOptions(inv, iv);
T('Event invitation: Yes and No answers; Yes carries the title, date, time and place', inv.kind === 'event' && io.length === 2 && io[0].k === 'yes' && io[0].data.title === 'Demo day' && io[0].data.date === '2026-12-05' && io[0].data.time === '10:00' && io[0].data.place === 'Online' && io[1].k === 'no');
const fol = entGet('follow'), fo = entOptions(fol, {}), mt = entGet('meeting'), mo = entOptions(mt, {});
T('Gentle reminder: the hotel opens the live calendar (a call) or says later; Meeting request: the live calendar for a meeting', fol.kind === 'book' && fo.length === 2 && fo[0].k === 'book' && fo[1].k === 'later' && mt.kind === 'bookm' && mo[0].k === 'book' && mo[0].data.title === 'Meeting');
T('the subject follows the boxes and keeps {{hotel}} for each hotel', entSubject(inv, iv) === 'You are invited: Demo day' && entGet('offer').subject.includes('{{hotel}}'));
T('a template tells which boxes are empty; an (optional) box may stay empty', entMissing(inv, { 'event name': '', 'event date': '2026-12-05' }).includes('Event name') && entMissing({ fields: [{ k: 'x (optional)', label: 'X (optional)' }] }, {}).length === 0);
recs.push({ key: 'letter', name: 'Letter', small: '', subject: 'My subject [Topic]', html: '<p>Hi {{hotel}} [Topic]</p>', tkind: '', btn: '' });
T("the CEO's own wording and design replace the starting text; the boxes follow the new text", entGet('letter').html === '<p>Hi {{hotel}} [Topic]</p>' && entGet('letter').edited === true && entGet('letter').fields.map(f => f.k).join() === 'topic');
recs.push({ key: 'c_new1', name: 'Mine', small: 'x', subject: 'Hello', html: '<p>[Your name]</p>', tkind: 'interest', btn: 'Count me in' });
T('the CEO can add a template of their own, with its answer button', entList().length === 12 && entGet('c_new1').custom === true && entOptions(entGet('c_new1'), {})[0].label === 'Count me in');

/* ---- the page ---- */
T('the page: Plain keeps the free editor; the CEO alone sees Edit template and New template (text, design code, answer buttons); a person fills boxes, not the text', crm.includes("card('plain', 'Plain'") && crm.includes("(Auth.isProvider() ? '' : ' hidden')") && crm.includes("toast('Only the CEO edits a template')") && crm.includes("toast('Only the CEO makes a template')") && crm.includes('Design (code)') && crm.includes("$('#en_plain').hidden = !!tt;") && crm.includes('function entSafe(html)'));
T('the page: each batch carries the hotel names and ids and the template with its answer choices; the boxes must be filled first', crm.includes('...enewsPayload(e), ...enRcpt(part)') && crm.includes('p.tpl = {id: tt.id, name: tt.name') && crm.includes("toast('Fill in: ' + miss.join(', '))"));
T('the page: a saved draft keeps its template and boxes; Replies are listed under Saved (hotel, the choice, the note, the date)', crm.includes("tpl: e.tpl || 'plain', vals: e.vals || {}") && crm.includes("K('reply').sort") && crm.includes('No replies yet.'));

T('the CEO sheet has the note that explains the [ ] words: date, time, large box, optional, {{hotel}}, {{buttons}}', crm.includes('id="et_note"') && crm.includes('<b>[... date ...]</b> a calendar') && crm.includes('<b>[... time ...]</b> a clock') && crm.includes('(optional)') && crm.includes('{{hotel}}</b> is the name of each hotel'));

/* ---- the mail function ---- */
T('mail function: {{hotel}} becomes each hotel\'s name; each choice gets its own signed link (60 days); a test mail gets links that record nothing', send.includes('swap(s, "{{hotel}}", esc(name))') && send.includes('"https://replace.me/" + k') && send.includes('60 * 86400000') && send.includes('action === "test" ? "test"') && send.includes('names[email]'));
T('mail function: the extra styles are limited to safe ones', send.includes('"border", "border-left", "border-top", "margin", "margin-top", "margin-bottom", "width"') && !/"(position|float|background-image|url)"/.test(send));

/* ---- crm-reply ---- */
T('reply function: the signed token is checked; a second click records nothing new; a test link records nothing', reply.includes('sig !== (await hmac(body))') && reply.includes('if (had) return json(req, { ok: true, done: true })') && reply.includes('p.h === "test"'));
T('reply function: the answer is kept as a reply; Yes of an event makes a Meeting (date, time, place); a time of a reminder makes a Follow up for that day', reply.includes('kind: "reply"') && reply.includes('p.k === "event" && p.o === "yes"') && reply.includes('type: "Meeting"') && reply.includes('meeting: true') && reply.includes('p.k === "remind" && /^s\\d$/.test(p.o)') && reply.includes('nextDate: str(d.date, 10)') && reply.includes('done: false'));

/* ---- the Worker page ---- */
T('Worker: crm.maha-hub.com/r/<token> opens the answer page; it is routed first', worker.includes("/^\\/r\\/[A-Za-z0-9_.-]{40,900}$/") && wr.includes('"/r/*"'));
import('../../workers/maha-hub-pms/src/index.js').then(async m => {
  const env = { ASSETS: { fetch: () => new Response('x') }, CRM_HOST: 'crm.maha-hub.com', SUPABASE_URL: 'https://x.supabase.co' };
  const tok = 'a'.repeat(60) + '.' + 'b'.repeat(43);
  const r = await m.default.fetch(new Request('https://crm.maha-hub.com/r/' + tok), env), h = await r.text();
  let parses = true; try { new Function(h.split('<script>')[1].split('</scr')[0]); } catch (e) { parses = false; }
  T('Worker: the page asks the hotel to confirm (a mail scanner opening the link changes nothing) and its script runs', r.status === 200 && h.includes('crm-reply') && h.includes('Confirm') && parses && /connect-src https:\/\/x\.supabase\.co/.test(r.headers.get('content-security-policy')));
  const o = await m.default.fetch(new Request('https://pms.maha-hub.com/r/' + tok), env);
  T('Worker: the answer page is only on the CRM address', o.status !== 200 || !(await o.clone().text()).includes('crm-reply'));
  process.exit(fails ? 1 : 0);
});
