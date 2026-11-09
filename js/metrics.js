/* Métricas de productividad y planificación.

   Productividad del día
   - Peso de una tarea      w = duración (min) × factor de prioridad (baja 1 · media 1.5 · alta 2)
   - Avance                 A = Σ w hechas / Σ w planificadas
   - Puntualidad            P = tareas marcadas antes del fin de su bloque + 10 min / tareas hechas
   - Índice                 I = A × (0.8 + 0.2·P)   → 100 % solo si todo se hizo y a tiempo
   - Puntos                 10 × prioridad por tarea hecha, +5 si fue puntual
   - Racha                  días seguidos con I ≥ 70 % (los días sin plan no la rompen)

   Nota de planificación (1–10) de un día
   - Momento en que se planificó (por tarea y por la confirmación del plan):
       noche anterior = 100 % · al levantarse (mismo día antes de la hora límite, 09:00) = 50 % · más tarde = 20 %
   - Anticipación  An = ½·(promedio del momento de creación de las tareas) + ½·(momento de confirmación)
   - Bono de puntos: +15 si el plan se confirmó la noche anterior, +5 si fue al levantarse
   - Cobertura     Co = entregas que vencen en los próximos 7 días con al menos un bloque agendado
   - Equilibrio    Eq = ½·carga del día (ideal 40–85 % de las horas útiles) + ½·(horas de trabajo propio / meta diaria),
                        multiplicado por la fracción de actividades sin choques con comidas u otras tareas
   - Nota          N  = 1 + 9·(0.4·An + 0.3·Co + 0.3·Eq) */
(function () {
  const { toMin, ymd, parseYmd, addDays, span } = Store.util;
  const PRIO = { 1: 1, 2: 1.5, 3: 2 };
  const TOL_MIN = 10;
  const STREAK_GOAL = 0.7;
  const LEVEL_PTS = 500;

  const duration = t => { const [s, e] = span(t.start, t.end); return Math.max(e - s, 5); };

  function onTime(t) {
    if (!t.doneAt) return false;
    const [, e] = span(t.start, t.end);
    const end = parseYmd(t.day); end.setMinutes(e + TOL_MIN);
    return new Date(t.doneAt) <= end;
  }

  // Valor de anticipación según cuándo se planificó (ver cabecera)
  function timing(iso, dateStr) {
    if (!iso) return { v: 0, when: 'sin confirmar' };
    const t = new Date(iso), d0 = parseYmd(dateStr);
    if (t < d0) return { v: 1, when: 'noche anterior' };
    const cut = new Date(d0); cut.setMinutes(toMin(Store.state.settings.morningPlanUntil || '09:00'));
    if (t <= cut) return { v: 0.5, when: 'al levantarse' };
    const end = new Date(d0); end.setDate(end.getDate() + 1);
    return t < end ? { v: 0.2, when: 'durante el día' } : { v: 0, when: 'después del día' };
  }
  const PLAN_BONUS = { 1: 15, 0.5: 5 };

  function day(dateStr) {
    const list = Store.tasksFor(dateStr);
    let wPlan = 0, wDone = 0, done = 0, punctual = 0, points = 0, minPlan = 0, minDone = 0;
    const byCat = {};
    for (const t of list) {
      const dur = duration(t), w = dur * (PRIO[t.priority] || 1);
      wPlan += w; minPlan += dur;
      const c = (byCat[t.category] ||= { planned: 0, done: 0, count: 0, doneCount: 0 });
      c.planned += dur; c.count++;
      if (t.doneAt) {
        wDone += w; minDone += dur; done++; c.done += dur; c.doneCount++;
        const ok = onTime(t); if (ok) punctual++;
        points += 10 * (Number(t.priority) || 1) + (ok ? 5 : 0);
      }
    }
    const planBonus = list.length ? (PLAN_BONUS[timing(Store.state.planLog[dateStr], dateStr).v] || 0) : 0;
    points += planBonus;
    const avance = wPlan ? wDone / wPlan : 0;
    const punct = done ? punctual / done : 0;
    const index = avance * (0.8 + 0.2 * punct);
    const today = ymd(new Date());
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const overdue = list.filter(t => !t.doneAt && (dateStr < today || (dateStr === today && span(t.start, t.end)[1] <= nowM))).length;
    return { list, total: list.length, done, punctual, late: done - punctual, overdue, avance, punct, index, points, planBonus, minPlan, minDone, byCat };
  }

  // ---------- nota de planificación ----------
  function overlaps(a, b) { const [s1, e1] = span(a.start, a.end), [s2, e2] = span(b.start, b.end); return s1 < e2 && s2 < e1; }

  function planning(dateStr) {
    const list = Store.tasksFor(dateStr);
    const dayStart = parseYmd(dateStr);
    if (!list.length) return { score: 1, pct: 0, an: 0, co: 0, eq: 0, hours: 0, clashes: 0, confirmed: false, empty: true };

    const early = list.reduce((a, t) => a + (t.rec && t.rec !== 'none' ? 1 : timing(t.created, dateStr).v), 0) / list.length;
    const conf = timing(Store.state.planLog[dateStr], dateStr);
    const confirmed = conf.v === 1;
    const an = 0.5 * early + 0.5 * conf.v;

    // entregas que vencen dentro de los 7 días siguientes a este día
    const limit = addDays(dateStr, 7);
    const due = Store.allPendings({ includeClosed: true }).filter(p => p.due && p.due.slice(0, 10) >= dateStr && p.due.slice(0, 10) <= limit);
    const covered = due.filter(p => p.status !== 'open' || Store.state.tasks.some(t => t.pendingId === p.id && t.date <= p.due.slice(0, 10)));
    const co = due.length ? covered.length / due.length : 1;

    const meals = Store.mealsFor(dateStr);
    let clashes = 0;
    list.forEach((t, i) => {
      if (meals.some(m => overlaps(t, m)) || list.some((u, j) => j !== i && overlaps(t, u))) clashes++;
    });
    // Carga: horas comprometidas (clases + tareas) frente a las horas útiles del día (16 h despierto − comidas)
    const hours = list.reduce((a, t) => a + duration(t), 0) / 60;
    const mealH = meals.reduce((a, m) => a + (span(m.start, m.end)[1] - span(m.start, m.end)[0]), 0) / 60;
    const load = hours / Math.max(1, 16 - mealH);
    const loadScore = load < 0.4 ? load / 0.4 : load <= 0.85 ? 1 : Math.max(0, 1 - (load - 0.85) / 0.25);
    // Trabajo propio (sin clases) frente a la meta diaria
    const goal = Number(Store.state.settings.dailyGoalHours) || 6;
    const ownH = list.filter(t => t.category !== 'Clase').reduce((a, t) => a + duration(t), 0) / 60;
    const goalScore = Math.min(1, ownH / goal);
    const eq = (0.5 * loadScore + 0.5 * goalScore) * (1 - clashes / list.length);

    const raw = 0.4 * an + 0.3 * co + 0.3 * eq;
    return { score: Math.round((1 + 9 * raw) * 10) / 10, pct: raw, an, co, eq, hours, ownH, load, clashes, confirmed, confirmedWhen: conf.when, confirmV: conf.v, early, dueCount: due.length, coveredCount: covered.length, empty: false };
  }

  // ---------- acumulados ----------
  function firstDate() {
    const ds = Store.state.tasks.map(t => t.date).filter(Boolean).sort();
    return ds[0] || ymd(new Date());
  }

  function totals() {
    const today = ymd(new Date());
    let d = firstDate(), points = 0, guard = 0;
    while (d <= today && guard++ < 1500) { points += day(d).points; d = addDays(d, 1); }
    let streak = 0;
    const td = day(today);
    if (td.total && td.index >= STREAK_GOAL) streak++;
    let cur = addDays(today, -1); const start = firstDate(); let steps = 0;
    while (cur >= start && steps++ < 500) {
      const m = day(cur);
      if (m.total) { if (m.index >= STREAK_GOAL) streak++; else break; }
      cur = addDays(cur, -1);
    }
    const spent = Store.state.rewards.filter(r => r.claimed).reduce((a, r) => a + r.pts, 0);
    const level = Math.floor(points / LEVEL_PTS) + 1;
    return { points, spent, available: points - spent, streak, level, levelProgress: (points % LEVEL_PTS) / LEVEL_PTS, toNext: LEVEL_PTS - (points % LEVEL_PTS) };
  }

  function range(n) {
    const today = ymd(new Date());
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = addDays(today, -i); const m = day(d); out.push({ date: d, index: m.index, total: m.total, m }); }
    return out;
  }
  const avgIndex = arr => { const w = arr.filter(d => d.total); return w.length ? w.reduce((a, d) => a + d.index, 0) / w.length : 0; };

  // Recompensa: se desbloquea con puntos disponibles Y promedio de los últimos 7 días ≥ su mínimo
  function rewardStatus(r, tot = totals(), week = avgIndex(range(7))) {
    if (r.claimed) return { state: 'claimed' };
    const okPts = tot.available >= r.pts, okWeek = week >= (r.minWeek ?? 0.7);
    return { state: okPts && okWeek ? 'ready' : 'locked', okPts, okWeek, week, missingPts: Math.max(0, r.pts - tot.available) };
  }

  window.Metrics = { day, planning, timing, totals, range, avgIndex, rewardStatus, duration, onTime, LEVEL_PTS, STREAK_GOAL, PRIO };
})();
