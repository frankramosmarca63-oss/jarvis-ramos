/* Recoge las noticias del día desde Google News (RSS) y las guarda en data/news.json.
   Corre cada madrugada (y a mediodía) desde .github/workflows/noticias.yml. No necesita claves. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url))).news;
const LOC = 'hl=es-419&gl=PE&ceid=PE:es-419';

function feedUrl(s) {
  if (s.feed === 'top') return `https://news.google.com/rss?${LOC}`;
  if (s.feed) return `https://news.google.com/rss/headlines/section/topic/${s.feed}?${LOC}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${s.query} when:${s.days || 1}d`)}&${LOC}`;
}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ''; };

async function fetchSection(id, s) {
  const r = await fetch(feedUrl(s), { headers: { 'User-Agent': 'jarvis-ramos-news/1.0' } });
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  const xml = await r.text();
  const seen = new Set();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).map(it => ({
    title: tag(it, 'title'), link: tag(it, 'link'), source: tag(it, 'source'), date: new Date(tag(it, 'pubDate')).toISOString(),
  })).filter(x => {
    const k = x.title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').slice(0, 60);
    if (!x.title || seen.has(k)) return false; seen.add(k); return true;
  });
  return items.slice(0, config.maxPerSection || 8);
}

const out = { generated: new Date().toISOString(), sections: {} };
for (const [id, s] of Object.entries(config.sections)) {
  try { out.sections[id] = { title: s.title, items: await fetchSection(id, s) }; console.log(`${id}: ${out.sections[id].items.length}`); }
  catch (e) { console.warn(e.message); out.sections[id] = { title: s.title, items: [] }; }
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/news.json', import.meta.url), JSON.stringify(out, null, 1));
