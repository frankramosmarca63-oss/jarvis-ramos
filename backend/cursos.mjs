/* Sincroniza tus cursos de la cuenta institucional:
   - Google Classroom: tareas con fecha de entrega y si ya las entregaste.
   - Gmail institucional: correos recientes que parecen de cursos (tarea, examen, informe…), con fecha detectada.
   El resultado va a users/{uid}/data/server y la app lo muestra en CURSOS → PENDIENTES.
   Secretos necesarios: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (ver herramientas/obtener_token.py). */
import { firebase, ref, config, ymd, addDays } from './lib.mjs';

const { GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: csec, GOOGLE_REFRESH_TOKEN: rt } = process.env;
if (!cid || !csec || !rt) { console.log('Classroom/Gmail no configurado todavía (faltan secretos). Nada que hacer.'); process.exit(0); }

async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('No se pudo renovar el acceso de Google: ' + JSON.stringify(j));
  return j.access_token;
}
const token = await accessToken();
async function api(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

await firebase();
const main = (await ref('main').get()).data() || {};
const subjects = main.subjects || [];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
const STOP = new Set(['de', 'la', 'los', 'las', 'del', 'y', 'e', 'en', 'ii', 'i', 'iii', 'mecanica', 'ingenieria']);
function matchSubject(text) {
  const words = new Set(norm(text).split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
  let best = null, bestScore = 0;
  for (const s of subjects) {
    const sw = norm(s.name).split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
    const score = sw.filter(w => [...words].some(x => x.startsWith(w.slice(0, 6)))).length / (sw.length || 1);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.5 ? best.id : '';
}
const pad = n => String(n).padStart(2, '0');

// ---------------- Classroom ----------------
const pendings = [];
try {
  const { courses = [] } = await api('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&studentId=me&pageSize=50');
  for (const c of courses) {
    let work = [];
    try { work = (await api(`https://classroom.googleapis.com/v1/courses/${c.id}/courseWork?pageSize=50&orderBy=dueDate%20desc`)).courseWork || []; }
    catch (e) { console.warn(c.name, e.message); continue; }
    let subs = [];
    try { subs = (await api(`https://classroom.googleapis.com/v1/courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=100`)).studentSubmissions || []; } catch { }
    const subState = Object.fromEntries(subs.map(s => [s.courseWorkId, s.state]));
    const fromDay = addDays(ymd(new Date()), -7);
    for (const w of work) {
      if (!w.dueDate) continue;
      const d = new Date(Date.UTC(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day, w.dueTime?.hours ?? 4, w.dueTime?.minutes ?? 59)); // hora en UTC → local (Lima)
      const due = `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (ymd(d) < fromDay) continue;
      const st = subState[w.id];
      pendings.push({
        id: `cw-${c.id}-${w.id}`, title: w.title, courseName: c.name, subjectId: matchSubject(c.name), due,
        link: w.alternateLink, source: 'classroom', turnedIn: st === 'TURNED_IN' || st === 'RETURNED',
      });
    }
  }
  console.log(`Classroom: ${courses.length} cursos, ${pendings.length} entregas.`);
} catch (e) { console.warn('Classroom:', e.message); }

// ---------------- Gmail ----------------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function detectDate(text) {
  const t = norm(text), now = new Date(), cand = [];
  for (const m of t.matchAll(/\b(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?\b/g)) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    cand.push(new Date(y, +m[2] - 1, +m[1]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s+de\s+([a-z]+)/g)) {
    const mi = MONTHS.findIndex(x => m[2].startsWith(x.slice(0, 4)));
    if (mi >= 0) cand.push(new Date(now.getFullYear(), mi, +m[1]));
  }
  const ok = cand.filter(d => !isNaN(d) && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && d - now < 90 * 864e5).sort((a, b) => a - b);
  return ok.length ? ymd(ok[0]) : null;
}
const emails = [];
try {
  const kw = config.gmail.keywords.map(norm);
  const { messages = [] } = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(config.gmail.query)}`);
  for (const { id } of messages) {
    const m = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`);
    const h = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
    const text = `${h.subject || ''} ${m.snippet || ''}`;
    if (!kw.some(k => norm(text).includes(k))) continue;
    emails.push({
      id: `gm-${id}`, subject: h.subject || '(sin asunto)', from: (h.from || '').replace(/<.*>/, '').trim(),
      snippet: (m.snippet || '').slice(0, 200), detectedDue: detectDate(text), subjectId: matchSubject(text),
      link: `https://mail.google.com/mail/u/0/#all/${id}`, date: new Date(Number(m.internalDate)).toISOString(),
    });
  }
  console.log(`Gmail: ${emails.length} correos de cursos.`);
} catch (e) { console.warn('Gmail:', e.message); }

await ref('server').set({ pendings, emails: emails.slice(0, 25), lastSync: new Date().toISOString() }, { merge: true });
