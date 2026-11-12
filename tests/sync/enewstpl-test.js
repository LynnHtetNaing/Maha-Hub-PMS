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
const overrides = [];
const code = crm.slice(i, j);
const api = new Function('K', 'Auth', 'fdate', 'esc', code + '\nreturn {ENEWS_TPL, entGet, entVals, entRender, entSubject, entMissing};')(
  k => k === 'enews_tpl' ? overrides : [], { who: () => 'Lynn' }, d => d ? 'D(' + d + ')' : '', s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const { ENEWS_TPL, entGet, entVals, entRender, entSubject, entMissing } = api;
T('ten templates', ENEWS_TPL.length === 10 && ['news', 'offer', 'update', 'invite', 'thanks', 'follow', 'season', 'notice', 'results', 'letter'].every(id => ENEWS_TPL.some(t => t.id === id)));

/* the mail function's cleaning code keeps what the templates use */
const sendSrc = send.replace(/\r\n/g, '\n');
const clean = sendSrc.split('// --- clean:start')[1].split('// --- clean:end')[0].replace(/^[^\n]*\n/, '');
const { cleanHtml } = new Function(clean.replace(/: (any|string)(?=[,)\s=])/g, '') + '\nreturn { cleanHtml };')();

let allOk = true, leftOver = [], linkBad = [], styleLost = [];
for (const t of ENEWS_TPL) {
  const v = entVals(t, null);
  (t.fields || []).forEach(f => { if (f.type === 'date') v[f.k] = '2026-12-01'; else if (!v[f.k]) v[f.k] = 'X' + f.k; });
  const html = entRender(t, v), left = (html.match(/\{\{[a-zA-Z0-9]+\}\}/g) || []).filter(x => x !== '{{hotel}}');
  if (left.length) leftOver.push(t.id + ':' + left.join(','));
  const opts = t.options ? t.options(v) : [];
  opts.forEach(o => { if (!html.includes('https://replace.me/' + o.k)) linkBad.push(t.id + ':' + o.k); });
  const c = cleanHtml(html);
  if (!/(background-color|color):/.test(c) && /style=/.test(html) === false) allOk = allOk && true;
  if (/background-color:#0A3020/.test(html) && !/background-color:#0A3020/.test(c)) styleLost.push(t.id);
  if (opts.length && !opts.every(o => c.includes('https://replace.me/' + o.k))) linkBad.push(t.id + ':cleaned');
  if (entRender(t, v, true).includes('replace.me')) linkBad.push(t.id + ':preview');
}
T('every box of every template is filled and only {{hotel}} is left for each hotel: ' + leftOver.join(' '), leftOver.length === 0);
T('every answer button has its link, before and after cleaning, and the preview has none: ' + linkBad.join(' '), linkBad.length === 0);
T('the colours and boxes of the templates survive the cleaning of the mail function: ' + styleLost.join(' '), styleLost.length === 0);

const inv = entGet('invite'), iv = { title: 'Demo day', date: '2026-12-05', time: '10:00', place: 'Online', length: '30 min', sender: 'Lynn' };
const io = inv.options(iv);
T('Event invitation: Yes and No answers; Yes carries the title, date, time and place', inv.kind === 'event' && io.length === 2 && io[0].k === 'yes' && io[0].data.date === '2026-12-05' && io[0].data.time === '10:00' && io[0].data.place === 'Online' && io[1].k === 'no');
const fol = entGet('follow'), fo = fol.options({ date1: '2026-12-02', time1: '10:00', date2: '2026-12-03', time2: '14:00', date3: '', time3: '' });
T('Gentle reminder: one choice for each time filled in, and "call me later"', fol.kind === 'remind' && fo.length === 3 && fo[0].k === 's1' && fo[1].data.time === '14:00' && fo[2].k === 'later');
T('the subject follows the boxes and keeps {{hotel}} for each hotel', entSubject(inv, iv) === 'You are invited: Demo day' && entGet('offer').subject.includes('{{hotel}}'));
T('a template that needs its boxes says which one is empty', entMissing(inv, { title: '', date: '2026-12-05', time: '' }).join() === 'Event name,Time');
overrides.push({ key: 'letter', subject: 'My subject', html: '<p>Hi {{hotel}} {{message}}</p>' });
T("the CEO's own wording replaces the starting text, the boxes stay", entGet('letter').html === '<p>Hi {{hotel}} {{message}}</p>' && entGet('letter').subject === 'My subject' && entGet('letter').edited === true && entGet('letter').fields.length === 2);

/* ---- the page ---- */
T('the page: Plain keeps the free editor; the CEO alone sees "Edit template text"; a person fills boxes, not the text', crm.includes('card(\'plain\', \'Plain\'') && crm.includes("(Auth.isProvider() && e.tpl !== 'plain' ? '' : ' hidden')") && crm.includes("if (!Auth.isProvider()) { toast('Only the CEO edits a template'); return; }") && crm.includes("$('#en_plain').hidden = !!tt;"));
T('the page: each batch carries the hotel names and ids and the template with its answer choices; the boxes must be filled first', crm.includes('...enewsPayload(e), ...enRcpt(part)') && crm.includes('p.tpl = {id: tt.id, name: tt.name') && crm.includes("toast('Fill in: ' + miss.join(', '))"));
T('the page: a saved draft keeps its template and boxes; Replies are listed under Saved (hotel, the choice, the note, the date)', crm.includes("tpl: e.tpl || 'plain', vals: e.vals || {}") && crm.includes("K('reply').sort") && crm.includes('No replies yet.'));

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
