// Makes the Enewletter text safe before it goes out: only the tags and styles the CRM editor can make are kept
// (bold, italic, underline, headings, lists, links, images, lines, colours, a button). Everything else is removed.
const TAGS = new Set(["p", "br", "b", "strong", "i", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "a", "img", "div", "span", "hr", "blockquote"]);
const STYLE_OK = new Set(["color", "background-color", "text-align", "font-size", "font-weight", "font-style", "text-decoration", "display", "padding", "border-radius", "max-width", "line-height"]);
const cleanStyle = (s) => String(s || "").split(";").map((x) => {
  const i = x.indexOf(":"); if (i < 0) return "";
  const k = x.slice(0, i).trim().toLowerCase(), v = x.slice(i + 1).trim();
  return STYLE_OK.has(k) && /^[#\w\s%.,()-]{1,60}$/.test(v) && !/url|expression|javascript|import/i.test(v) ? `${k}:${v}` : "";
}).filter(Boolean).join(";");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unEnt = (s) => String(s).replace(/&amp;/g, "&");

export function cleanHtml(input) {
  const L = "\u0001", G = "\u0002";
  let h = String(input || "").replace(/[\u0001\u0002]/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, "");
  h = h.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g, (m, close, tag, attrs) => {
    tag = tag.toLowerCase(); if (!TAGS.has(tag)) return "";
    if (close) return `${L}/${tag}${G}`;
    let out = "";
    for (const a of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const k = a[1].toLowerCase(), v = unEnt(a[2] ?? a[3] ?? "");
      if (k === "style") { const c = cleanStyle(v); if (c) out += ` style="${escAttr(c)}"`; }
      else if (k === "href" && tag === "a" && /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(v)) out += ` href="${escAttr(v)}"`;
      else if (k === "src" && tag === "img" && /^https:\/\/[^\s"'<>]+$/i.test(v)) out += ` src="${escAttr(v)}"`;
      else if (k === "alt" && tag === "img") out += ` alt="${escAttr(v.slice(0, 120))}"`;
      else if ((k === "width" || k === "height") && tag === "img" && /^\d{1,4}$/.test(v)) out += ` ${k}="${v}"`;
    }
    if (tag === "a") out += ` target="_blank" rel="noopener"`;
    return `${L}${tag}${out}${tag === "br" || tag === "hr" || tag === "img" ? " /" : ""}${G}`;
  });
  return h.replace(/</g, "&lt;").replace(/>/g, "&gt;").split(L).join("<").split(G).join(">");
}

export const textOf = (html) => String(html || "").replace(/<(br|\/p|\/div|\/h[1-3]|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

export const ATTACH_NAME = /^[\w .()-]{1,100}\.(pdf|png|jpe?g|docx?|xlsx?|pptx?)$/i;
export const ATTACH_MAX_B64 = 4_200_000;   // about 3 MB of file
export const cleanAttachment = (a) => a && ATTACH_NAME.test(String(a.name || "")) && /^[A-Za-z0-9+/=]+$/.test(String(a.content || "")) && String(a.content).length <= ATTACH_MAX_B64 ? { name: String(a.name), content: String(a.content) } : null;
