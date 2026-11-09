/* Almacenamiento del Jarvis.
   - Siempre guarda una copia local (localStorage) para que la app abra al instante y sin internet.
   - Si la nube (Firebase) está configurada, cloud.js sincroniza este mismo estado entre equipos.
   - Los datos que trae el servidor (Classroom, Gmail, avisos enviados) llegan aparte en Store.server. */
(function () {
  const KEY = 'jarvis-ramos-v2';
  const OLD_KEY = 'jarvis-ramos-v1';
  const listeners = new Set();

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  const defaults = () => ({
    version: 2,
    updatedAt: 0,
    tasks: [],        // {id,title,category,priority,start,end,date,rec,notes,subjectId,topicId,pendingId,created}
    done: {},         // "taskId|YYYY-MM-DD" -> ISO
    notified: {},     // avisos locales ya mostrados
    planLog: {},      // "YYYY-MM-DD" -> ISO en que se confirmó el plan de ese día
    briefed: {},      // "YYYY-MM-DD" -> ISO en que se escuchó el informe
    settings: { sound: true, voice: true, name: 'señor', remindBefore: 5, briefingTime: '05:00', planTime: '21:30', morningPlanUntil: '09:00', dailyGoalHours: 6 },
    // Horario de alimentación: bloques fijos, aparte de las tareas (no cuentan en la productividad)
    meals: [
      { id: 'm1', label: 'Desayuno', start: '07:00', end: '07:30', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'm2', label: 'Almuerzo', start: '13:00', end: '14:00', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'm3', label: 'Cena', start: '19:30', end: '20:00', days: [0, 1, 2, 3, 4, 5, 6] },
    ],
    subjects: [],     // {id,name,teacher,color,exams:[{id,name,date}]}
    topics: [],       // {id,subjectId,name,confidence(1-5),reviews:[ISO]}
    pendings: [],     // manuales: {id,title,subjectId,due,link,notes}
    pendingState: {}, // id -> 'done' | 'dismissed' (también para los que vienen de Classroom/Gmail)
    rewards: [
      { id: 'r1', label: 'Un capítulo de tu serie', pts: 200, minWeek: 0.6, claimed: null },
      { id: 'r2', label: 'Salida o antojo del fin de semana', pts: 500, minWeek: 0.7, claimed: null },
      { id: 'r3', label: 'Comprar ese componente que quieres', pts: 1000, minWeek: 0.75, claimed: null },
    ],
  });

  function migrate(data) {
    const d = defaults();
    const out = { ...d, ...data, version: 2, settings: { ...d.settings, ...(data.settings || {}) } };
    // recompensas v1 no tenían id ni condición semanal
    out.rewards = (out.rewards || []).map((r, i) => ({ id: r.id || 'r' + (i + 1), minWeek: 0.7, claimed: null, ...r }));
    for (const k of ['tasks', 'meals', 'subjects', 'topics', 'pendings']) if (!Array.isArray(out[k])) out[k] = d[k];
    for (const k of ['done', 'notified', 'planLog', 'briefed', 'pendingState']) if (typeof out[k] !== 'object' || !out[k]) out[k] = {};
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
      return raw ? migrate(JSON.parse(raw)) : defaults();
    } catch (e) {
      console.warn('No se pudo leer el almacenamiento local; se inicia vacío.', e);
      return defaults();
    }
  }

  let state = load();
  let server = { pendings: [], emails: [], notified: {}, lastSync: null };

  function persistLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('No se pudo guardar localmente', e); }
  }

  function save() {
    state.updatedAt = Date.now();
    persistLocal();
    listeners.forEach(fn => { try { fn('local'); } catch (e) { console.error(e); } });
  }

  // Reemplazo desde la nube (no vuelve a subir)
  function replace(data) {
    state = migrate(data);
    persistLocal();
    listeners.forEach(fn => { try { fn('remote'); } catch (e) { console.error(e); } });
  }

  function setServer(data) {
    server = { pendings: [], emails: [], notified: {}, ...(data || {}) };
    listeners.forEach(fn => { try { fn('server'); } catch (e) { console.error(e); } });
  }

  // ---- fechas (hora local) ----
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const fromMin = m => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const span = (a, b) => { const s = toMin(a); let e = toMin(b); if (e <= s) e += 1440; return [s, e]; };

  function occursOn(task, dateStr) {
    if (!task.rec || task.rec === 'none') return task.date === dateStr;
    if (dateStr < task.date) return false;
    const w = parseYmd(dateStr).getDay();
    if (task.rec === 'daily') return true;
    if (task.rec === 'weekdays') return w >= 1 && w <= 5;
    if (task.rec === 'weekly') return parseYmd(task.date).getDay() === w;
    return false;
  }

  function tasksFor(dateStr) {
    return state.tasks
      .filter(t => occursOn(t, dateStr))
      .map(t => { const key = `${t.id}|${dateStr}`; return { ...t, day: dateStr, key, doneAt: state.done[key] || null }; })
      .sort((a, b) => toMin(a.start) - toMin(b.start));
  }

  function mealsFor(dateStr) {
    const w = parseYmd(dateStr).getDay();
    return state.meals.filter(m => (m.days || []).includes(w)).map(m => ({ ...m, key: `meal-${m.id}|${dateStr}` }))
      .sort((a, b) => toMin(a.start) - toMin(b.start));
  }

  // ---- tareas ----
  function upsertTask(t) {
    const i = state.tasks.findIndex(x => x.id === t.id);
    if (i >= 0) state.tasks[i] = { ...state.tasks[i], ...t };
    else state.tasks.push({ ...t, id: uid(), created: new Date().toISOString() });
    save();
  }
  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    Object.keys(state.done).forEach(k => { if (k.startsWith(id + '|')) delete state.done[k]; });
    save();
  }
  function toggleDone(key) {
    const [taskId] = key.split('|');
    const task = state.tasks.find(t => t.id === taskId);
    if (state.done[key]) {
      delete state.done[key];
      if (task?.topicId) { const tp = state.topics.find(x => x.id === task.topicId); if (tp) tp.reviews = (tp.reviews || []).filter(r => r !== tp._lastAuto); }
    } else {
      const now = new Date().toISOString();
      state.done[key] = now;
      // completar una tarea vinculada a un tema cuenta como repaso de ese tema
      if (task?.topicId) { const tp = state.topics.find(x => x.id === task.topicId); if (tp) { tp.reviews = [...(tp.reviews || []), now]; tp._lastAuto = now; } }
      if (task?.pendingId && task.closesPending) state.pendingState[task.pendingId] = 'done';
    }
    save();
    return !!state.done[key];
  }

  function markNotified(k) {
    state.notified[k] = Date.now();
    const limit = Date.now() - 3 * 864e5;
    for (const key in state.notified) if (state.notified[key] < limit) delete state.notified[key];
    persistLocal(); // los avisos locales no necesitan disparar un re-render
  }
  const wasNotified = k => !!(state.notified[k] || server.notified?.[k]);

  // ---- colecciones genéricas ----
  function upsert(coll, item) {
    const arr = state[coll];
    const i = arr.findIndex(x => x.id === item.id);
    if (i >= 0) arr[i] = { ...arr[i], ...item }; else arr.push({ ...item, id: item.id || uid() });
    save();
  }
  function remove(coll, id) {
    state[coll] = state[coll].filter(x => x.id !== id);
    if (coll === 'subjects') {
      state.topics = state.topics.filter(t => t.subjectId !== id);
      state.tasks.forEach(t => { if (t.subjectId === id) { t.subjectId = ''; t.topicId = ''; } });
    }
    if (coll === 'topics') state.tasks.forEach(t => { if (t.topicId === id) t.topicId = ''; });
    save();
  }

  // Pendientes = manuales + los que trae el servidor (Classroom/Gmail), sin los descartados
  function allPendings({ includeClosed = false } = {}) {
    const fromServer = (server.pendings || []).map(p => ({ ...p, fromServer: true }));
    const list = [...state.pendings.map(p => ({ ...p, source: p.source || 'manual' })), ...fromServer]
      .map(p => ({ ...p, status: state.pendingState[p.id] || (p.turnedIn ? 'done' : 'open') }));
    return list.filter(p => includeClosed || p.status === 'open')
      .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
  }
  function setPendingState(id, st) { if (st) state.pendingState[id] = st; else delete state.pendingState[id]; save(); }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.tasks)) throw new Error('Archivo no válido');
    state = migrate(data); save();
  }

  window.Store = {
    get state() { return state; },
    get server() { return server; },
    save, replace, setServer, onChange: fn => listeners.add(fn),
    tasksFor, mealsFor, upsertTask, deleteTask, toggleDone, markNotified, wasNotified,
    upsert, remove, allPendings, setPendingState, exportJSON, importJSON, uid,
    util: { pad, ymd, parseYmd, toMin, fromMin, addDays, span, occursOn },
  };
})();
