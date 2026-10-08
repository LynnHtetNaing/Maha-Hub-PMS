"""Builds one self-contained file with every page, for previewing without a server.
Every menu item, title and link opens the right page inside the same file."""
import os, re, base64, html
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')) + '/'
PAGES = ["index", "products", "solutions", "about", "pricing", "security", "contact", "privacy", "terms", "refund"]
css = open(SITE + 'assets/styles.css').read()
js = open(SITE + 'assets/site.js').read()
shell = open(SITE + 'index.html').read()

def main_of(name):
    h = open(SITE + name + '.html').read()
    m = re.search(r'<main id="main">(.*)</main>', h, re.S)
    title = re.search(r'<title>(.*?)</title>', h).group(1)
    return m.group(1), html.unescape(title)

def relink(body, page):
    # in-page anchors (#section) become #page/section
    body = re.sub(r'href="#([A-Za-z][\w-]*)"', lambda m: f'href="#{page}/{m.group(1)}"', body)
    # links to other pages
    def fix(m):
        name, q, a = m.group(1), m.group(2) or '', m.group(3) or ''
        return f'href="#{name}{"/" + a[1:] if a else ""}{q}"'
    body = re.sub(r'href="(' + '|'.join(PAGES) + r')\.html(\?[^"#]*)?(#[\w-]+)?"', fix, body)
    return body

parts = []
for p in PAGES:
    body, title = main_of(p)
    parts.append(f'<div class="pv-page" data-page="{p}" data-title="{html.escape(title)}"{"" if p == "index" else " hidden"}>{relink(body, p)}</div>')

out = shell
out = re.sub(r'<main id="main">.*</main>', lambda m: '<main id="main">' + ''.join(parts) + '</main>', out, flags=re.S)
# header and footer links
head_end = out.index('<main id="main">'); foot_start = out.index('</main>')
out = relink(out[:head_end], 'index').replace('href="#index/main"', 'href="#main"') + out[head_end:foot_start] + relink(out[foot_start:], 'index')
out = out.replace('<link rel="stylesheet" href="assets/styles.css">', '<style>\n' + css + '''
.pv-page{animation:pvin .75s cubic-bezier(.22,.61,.36,1)}
</style>''')
big = 'data:image/jpeg;base64,' + base64.b64encode(open(SITE + 'assets/maha-hub-hero.jpg', 'rb').read()).decode()
out = out.replace('<link rel="preload" as="image" href="assets/maha-hub-hero.jpg">', '')
out = out.replace('src="assets/maha-hub-hero.jpg" srcset="assets/maha-hub-hero-sm.jpg 960w, assets/maha-hub-hero.jpg 1671w" sizes="100vw"', f'src="{big}"')
router = '''
/* Page router for the one-file preview: #page/section?query, with the curtain between pages */
(function(){
  var pages = document.querySelectorAll('.pv-page'), currentName = null;
  function parse(){
    var h = location.hash.slice(1) || 'index';
    var q = h.indexOf('?'), query = q > -1 ? h.slice(q + 1) : ''; if (q > -1) h = h.slice(0, q);
    var bits = h.split('/');
    return { name: bits[0], anchor: bits[1], query: query, raw: h };
  }
  function swap(r){
    var target = document.querySelector('.pv-page[data-page="' + r.name + '"]') || pages[0];
    var name = target.dataset.page;
    pages.forEach(function(p){ p.hidden = p !== target; });
    document.title = target.dataset.title;
    document.querySelectorAll('.nav a').forEach(function(a){
      var on = a.getAttribute('href') === '#' + name; a.toggleAttribute('aria-current', on); if (on) a.setAttribute('aria-current','page');
    });
    if (window.MahaInk) window.MahaInk();
    var head = document.querySelector('.site-head'); if (head) head.classList.remove('open');
    var el = r.anchor && target.querySelector('#' + r.anchor);
    if (el) { el.scrollIntoView({block:'start', behavior:'instant'}); } else { window.scrollTo({top:0, left:0, behavior:'instant'}); }
    if (name === 'contact' && r.query) {
      var prod = new URLSearchParams(r.query).get('product'), sel = target.querySelector('#f-interest');
      if (prod && sel) [].forEach.call(sel.options, function(o){ if (o.value === prod) sel.value = prod; });
    }
    if (name === 'index') { document.body.classList.remove('loaded'); void document.body.offsetWidth; document.body.classList.add('loaded'); }
    target.querySelectorAll('[data-reveal]').forEach(function(x){ x.classList.remove('in'); });
    setTimeout(function(){ target.querySelectorAll('[data-reveal]').forEach(function(x){
      var b = x.getBoundingClientRect(); if (b.top < innerHeight && b.bottom > 0) x.classList.add('in'); }); window.dispatchEvent(new Event('scroll')); }, 350);
    if (window.MahaPT) window.MahaPT.enter(target);
    currentName = name;
  }
  function show(){
    var r = parse(); if (r.raw === 'main') return;
    var known = document.querySelector('.pv-page[data-page="' + r.name + '"]');
    if (!known) r.name = 'index';
    if (currentName === null) { swap(r); return; }
    if (r.name === currentName) {                          // same page: glide to the section
      var el = r.anchor && document.querySelector('.pv-page[data-page="' + r.name + '"] #' + r.anchor);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
      return;
    }
    var title = (known || pages[0]).dataset.title.split(' | ')[0];
    if (title.indexOf('Maha Hub') === 0) title = 'Home';
    window.MahaPT.cover(title, function(){ swap(r); });
  }
  var last = null;
  function route(){ var h = location.hash; if (h === last) return; last = h; show(); }
  /* take over in-page links so the browser never scrolls on its own before the page changes */
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]'); if (!a || e.metaKey || e.ctrlKey) return;
    var href = a.getAttribute('href'); if (href === '#' || href === '#main') return;
    e.preventDefault();
    if (href !== location.hash) history.pushState(null, '', href);
    route();
  });
  window.addEventListener('popstate', route); window.addEventListener('hashchange', route); route();
})();
'''
out = out.replace('<script src="assets/site.js" defer></script>', '<script>window.__MAHA_ONEFILE=true;\n' + js + router + '\n</script>')
out = out.replace('src="assets/maha-hub-hero.jpg"', 'data-hero=""')
import os as _os
for _f in _os.listdir(SITE + 'assets/banners'):
    _d = 'data:image/jpeg;base64,' + base64.b64encode(open(SITE + 'assets/banners/' + _f, 'rb').read()).decode()
    out = out.replace('"assets/banners/' + _f + '"', '"' + _d + '"')
out = out.replace('</body>', '<script>(function(){var h=document.querySelector(".hl-stage img");document.querySelectorAll("img[data-hero]").forEach(function(i){i.src=h.src;});})();</script></body>')
assert 'assets/' not in out, [out[i-80:i+40] for i in [out.find('assets/')]]
open('/mnt/user-data/outputs/maha-hub-full-site.html', 'w').write(out)
print('preview', len(out) // 1024, 'KB')
