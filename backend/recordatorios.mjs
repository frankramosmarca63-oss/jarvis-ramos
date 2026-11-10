/* Envía las notificaciones push aunque la app esté cerrada.
   Corre cada 10 minutos (.github/workflows/recordatorios.yml). GitHub puede retrasar unos minutos
   las tareas programadas, por eso cada aviso tiene una ventana amplia y se envía una sola vez. */
import { firebase, ref, push, ymd, addDays, toMin, span, parseYmd, tasksFor, mealsFor, monthSummary, admin } from './lib.mjs';

await firebase();
const [mainSnap, serverSnap] = await Promise.all([ref('main').get(), ref('server').get()]);
if (!mainSnap.exists) { console.log('Aún no hay datos en la nube.'); process.exit(0); }
const state = mainSnap.data();
const sent = serverSnap.data()?.notified || {};
const s = state.settings || {};
const now = new Date(), today = ymd(now), n = now.getHours() * 60 + now.getMinutes();
const before = Number(s.remindBefore ?? 5);
const name = s.name && s.name !== 'señor' ? s.name : 'Frank Ramos';
const early = Number(s.remindEarly ?? 30) || 0;
const lead = Math.max(before, 10); // el servidor corre cada 10 min
const updates = []; // pares [FieldPath, valor]
const FP = (...p) => new admin.firestore.FieldPath(...p);

async function once(key, title, body) {
  if (sent[key] || state.notified?.[key]) return;
  await push(title, body, key.split('|')[0]);
  updates.push([FP('notified', key), Date.now()]);
}

// 1) Actividades de hoy
for (const t of tasksFor(state, today)) {
  if (t.doneAt) continue;
  const [st, en] = span(t.start, t.end);
  if (early > lead && n >= st - early && n < st - lead) {
    await once(`early|${t.key}`, `En ${st - n} min: ${t.title}`, `Empieza a las ${t.start}. Vaya preparándose, ${name}.`);
  } else if (n >= st - lead && n < en) {
    await once(`start|${t.key}`, n < st ? `En ${st - n} min: ${t.title}` : `Ahora: ${t.title}`, `Bloque ${t.start}–${t.end}. ¡A trabajar, ${name}!`);
  } else if (n >= en && n < en + 60) {
    await once(`end|${t.key}`, `¿Completaste "${t.title}"?`, 'Márcala como hecha para registrar tu avance.');
  }
}
// 2) Comidas
for (const m of mealsFor(state, today)) {
  const [st, en] = span(m.start, m.end);
  if (n >= st - 5 && n < en) await once(m.key, `Hora de: ${m.label}`, `${m.start}–${m.end}. Pausa y aliméntate bien.`);
}
// 3) Informe matutino
const bt = toMin(s.briefingTime || '05:00');
if (n >= bt && n < bt + 180) {
  const list = tasksFor(state, today);
  await once(`brief|${today}`, `Buenos días, ${name}. Tu informe está listo`,
    list.length ? `${list.length} actividades hoy; la primera: ${list[0].title} a las ${list[0].start}. Toca para escuchar noticias y plan.`
      : 'No hay actividades para hoy. Toca para escuchar las noticias y planificar.');
}
// 3b) Si no planificó anoche: se puede al levantarse, pero resta
const cut = toMin(s.morningPlanUntil || '09:00');
if (n >= bt + 30 && n < cut && !state.planLog?.[today]) {
  await once(`morningplan|${today}`, 'No confirmaste tu plan anoche',
    `Puedes planificar ahora hasta las ${s.morningPlanUntil || '09:00'}: valdrá 50 % en anticipación. Después solo 20 %.`);
}
// 3c) Informe mensual: día 1 desde las 08:00
if (now.getDate() === 1 && now.getHours() >= 8) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const r = monthSummary(state, key);
  if (r.n) {
    const P = x => Math.round(x * 100) + ' %';
    const mejora = r.index < 0.7 ? 'Por mejorar: subir el índice a la meta del 70 %.' : r.punct < 0.6 ? 'Por mejorar: puntualidad.' : r.night / r.n < 0.6 ? 'Por mejorar: planificar más noches.' : 'Gran mes, mantén el ritmo.';
    await once(`month|${key}`, `Informe mensual listo · índice ${P(r.index)}`,
      `Meta cumplida ${r.over}/${r.n} días · puntualidad ${P(r.punct)} · plan de noche ${r.night}/${r.n}. ${mejora} Toca para ver recomendaciones.`);
  }
}
// 3d) Entregas (3 días, 1 día y el mismo día) y exámenes (7, 3, 1 y el mismo día), desde las 07:00
if (n >= 7 * 60) {
  const daysUntil = d => Math.round((parseYmd(d) - parseYmd(today)) / 864e5);
  const when = d => d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
  const ps = state.pendingState || {};
  const pend = [...(state.pendings || []), ...(serverSnap.data()?.pendings || [])].filter(p => p.due && !ps[p.id] && !p.turnedIn);
  for (const p of pend) {
    const d = daysUntil(p.due.slice(0, 10));
    if (![3, 1, 0].includes(d)) continue;
    const sched = (state.tasks || []).some(t => t.pendingId === p.id);
    await once(`due|${p.id}|${today}`, `Entrega ${when(d)}: ${p.title}`, sched ? 'Ya tiene un bloque agendado para avanzarla.' : 'Aún no tiene bloque agendado. Resérvele tiempo hoy.');
  }
  for (const sub of state.subjects || []) for (const e of sub.exams || []) {
    if (!e.date) continue;
    const d = daysUntil(e.date);
    if (![7, 3, 1, 0].includes(d)) continue;
    await once(`exam|${e.id}|${today}`, `${e.name} de ${sub.name} ${when(d)}`, d > 1 ? 'Agende sus repasos con tiempo.' : 'Último repaso y a descansar bien.');
  }
}
// 4) Planificación nocturna (se repite 1 h después si aún no hay plan para mañana)
const pt = toMin(s.planTime || '21:30');
const tomorrow = addDays(today, 1), tm = tasksFor(state, tomorrow).filter(t => t.category !== 'Clase');
if (n >= pt && n < pt + 120) {
  await once(`plan|${today}`, 'Planifica tu día de mañana',
    tm.length ? `Ya listaste ${tm.length} actividades además de tus clases. Revisa y confirma el plan.` : 'Aún no listaste tus actividades de mañana. Hazlo antes de dormir.');
}
if (n >= pt + 60 && n < pt + 180 && !state.planLog?.[tomorrow]) {
  await once(`plan2|${today}`, 'Tu plan de mañana sigue sin confirmar', 'Confírmalo para mejorar tu nota de planificación.');
}

if (updates.length) {
  // limpia registros de más de 3 días
  const limit = Date.now() - 3 * 864e5;
  for (const [k, v] of Object.entries(sent)) if (v < limit) updates.push([FP('notified', k), admin.firestore.FieldValue.delete()]);
  await ref('server').set({}, { merge: true });
  await ref('server').update(...updates.flat());
}
console.log(`Revisión ${today} ${now.toTimeString().slice(0, 5)}: ${updates.length} cambios.`);
