/* Utilidades compartidas del backend (corren en GitHub Actions con TZ=America/Lima). */
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

export const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url)));

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const span = (a, b) => { const s = toMin(a); let e = toMin(b); if (e <= s) e += 1440; return [s, e]; };

// Misma lógica que js/store.js
export function occursOn(task, dateStr) {
  if (!task.rec || task.rec === 'none') return task.date === dateStr;
  if (dateStr < task.date) return false;
  const w = parseYmd(dateStr).getDay();
  if (task.rec === 'daily') return true;
  if (task.rec === 'weekdays') return w >= 1 && w <= 5;
  if (task.rec === 'weekly') return parseYmd(task.date).getDay() === w;
  return false;
}
export const tasksFor = (state, d) => (state.tasks || []).filter(t => occursOn(t, d))
  .map(t => ({ ...t, key: `${t.id}|${d}`, doneAt: state.done?.[`${t.id}|${d}`] || null }))
  .sort((a, b) => toMin(a.start) - toMin(b.start));
export const mealsFor = (state, d) => { const w = parseYmd(d).getDay(); return (state.meals || []).filter(m => (m.days || []).includes(w)).map(m => ({ ...m, key: `meal-${m.id}|${d}` })); };

let db = null, uid = null;
export async function firebase() {
  if (db) return { db, uid };
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  const email = process.env.OWNER_EMAIL;
  if (!sa || !email) throw new Error('Faltan los secretos FIREBASE_SERVICE_ACCOUNT u OWNER_EMAIL en GitHub.');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  db = admin.firestore();
  uid = (await admin.auth().getUserByEmail(email)).uid;
  return { db, uid };
}
export const ref = name => db.doc(`users/${uid}/data/${name}`);

// Envía una notificación push a todos tus equipos registrados; limpia los tokens vencidos
export async function push(title, body, tag = 'jarvis', link) {
  const snap = await ref('devices').get();
  const tokens = Object.keys(snap.data()?.tokens || {});
  if (!tokens.length) { console.log('Sin equipos registrados para push'); return 0; }
  const base = process.env.APP_URL || '';
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: base + 'icons/icon-192.png', badge: base + 'icons/icon-192.png', tag, renotify: true, vibrate: [120, 60, 120] },
      fcmOptions: link || base ? { link: link || base } : undefined,
    },
    android: { priority: 'high' },
  });
  const dead = [];
  res.responses.forEach((r, i) => {
    if (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || ''))
      dead.push(new admin.firestore.FieldPath('tokens', tokens[i]), admin.firestore.FieldValue.delete());
  });
  if (dead.length) await ref('devices').update(...dead);
  console.log(`Push "${title}": ${res.successCount}/${tokens.length}`);
  return res.successCount;
}
export { admin };

// Índice del día (misma fórmula que js/metrics.js): Avance ponderado × (0.8 + 0.2·Puntualidad)
const PRIO = { 1: 1, 2: 1.5, 3: 2 };
export function dayIndex(state, d) {
  const list = tasksFor(state, d);
  let wp = 0, wd = 0, done = 0, ok = 0;
  for (const t of list) {
    const [s, e] = span(t.start, t.end), w = Math.max(e - s, 5) * (PRIO[t.priority] || 1);
    wp += w;
    if (t.doneAt) {
      wd += w; done++;
      const end = parseYmd(d); end.setMinutes(e + 10);
      if (new Date(t.doneAt) <= end) ok++;
    }
  }
  const av = wp ? wd / wp : 0, pu = done ? ok / done : 0;
  return { total: list.length, done, index: av * (0.8 + 0.2 * pu), punct: pu };
}
export function monthSummary(state, key) {
  const [y, m] = key.split('-').map(Number);
  const days = [];
  for (let d = ymd(new Date(y, m - 1, 1)); d <= ymd(new Date(y, m, 0)); d = addDays(d, 1)) {
    const r = dayIndex(state, d); if (r.total) days.push({ d, ...r });
  }
  const n = days.length, avg = f => n ? days.reduce((a, x) => a + f(x), 0) / n : 0;
  const night = days.filter(x => state.planLog?.[x.d] && new Date(state.planLog[x.d]) < parseYmd(x.d)).length;
  return { n, index: avg(x => x.index), punct: avg(x => x.punct), over: days.filter(x => x.index >= 0.7).length, night };
}
