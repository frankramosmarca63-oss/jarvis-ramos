/* Informe mensual: evalúa el mes, lo compara con el anterior y genera fortalezas, puntos a mejorar y recomendaciones.

   Calificación del mes (1–10) = 1 + 9·(0.5·Índice promedio + 0.2·Puntualidad promedio + 0.3·Nota de planificación promedio en %)
   Solo cuentan los días que tuvieron actividades planificadas. */
(function () {
  const { ymd, parseYmd, addDays, pad } = Store.util;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const P = x => `${Math.round(x * 100)} %`;

  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
  const label = key => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

  function stats(key) {
    const [y, m] = key.split('-').map(Number);
    const first = ymd(new Date(y, m - 1, 1)), last = ymd(new Date(y, m, 0));
    const end = last < ymd(new Date()) ? last : ymd(new Date());
    const days = [];
    for (let d = first; d <= end; d = addDays(d, 1)) {
      const md = Metrics.day(d);
      if (!md.total) continue;
      days.push({ d, md, pl: Metrics.planning(d) });
    }
    const n = days.length;
    const avg = f => n ? days.reduce((a, x) => a + f(x), 0) / n : 0;
    const withDone = days.filter(x => x.md.done);
    const index = avg(x => x.md.index), punct = withDone.length ? withDone.reduce((a, x) => a + x.md.punct, 0) / withDone.length : 0;
    const planPct = avg(x => x.pl.pct);
    const cats = {}, wd = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
    let ownH = 0, doneT = 0, totalT = 0, night = 0, morning = 0, late = 0, overdue = 0;
    for (const x of days) {
      doneT += x.md.done; totalT += x.md.total; overdue += x.md.total - x.md.done;
      for (const [c, v] of Object.entries(x.md.byCat)) { const k = (cats[c] ||= { p: 0, d: 0 }); k.p += v.planned; k.d += v.done; if (c !== 'Clase') ownH += v.done / 60; }
      const w = parseYmd(x.d).getDay(); wd[w].s += x.md.index; wd[w].n++;
      if (x.pl.confirmV === 1) night++; else if (x.pl.confirmV === 0.5) morning++; else late++;
    }
    const reviews = Store.state.topics.reduce((a, t) => a + (t.reviews || []).filter(r => r.slice(0, 7) === key).length, 0);
    const wdAvg = wd.map((v, i) => ({ i, a: v.n ? v.s / v.n : null })).filter(v => v.a != null).sort((a, b) => b.a - a.a);
    const grade = n ? 1 + 9 * (0.5 * index + 0.2 * punct + 0.3 * planPct) : null;
    return {
      key, n, index, punct, planPct, planScore: avg(x => x.pl.score), grade,
      overGoal: days.filter(x => x.md.index >= Metrics.STREAK_GOAL).length, doneT, totalT, overdue, ownH, reviews,
      night, morning, late, cats, best: wdAvg[0], worst: wdAvg[wdAvg.length - 1],
      points: days.reduce((a, x) => a + x.md.points, 0),
    };
  }

  function report(key = shiftMonth(monthKey(new Date()), -1)) {
    const s = stats(key), prev = stats(shiftMonth(key, -1));
    const good = [], improve = [], recs = [];
    if (!s.n) return { s, prev, good, improve, recs, empty: true, title: `Informe de ${label(key)}` };
    const delta = (a, b) => b == null || !prev.n ? '' : ` (${a >= b ? '+' : ''}${Math.round((a - b) * 100)} pts vs. mes anterior)`;

    // Fortalezas
    if (s.index >= 0.75) good.push(`Índice promedio alto: ${P(s.index)}${delta(s.index, prev.index)}.`);
    if (s.punct >= 0.75) good.push(`Buena puntualidad: ${P(s.punct)} de tus tareas se cerraron a tiempo.`);
    if (s.night / s.n >= 0.6) good.push(`Planificaste la noche anterior en ${s.night} de ${s.n} días.`);
    if (s.reviews >= 12) good.push(`Registraste ${s.reviews} repasos de temas: buena constancia de estudio.`);
    for (const [c, v] of Object.entries(s.cats)) if (v.p >= 300 && v.d / v.p >= 0.85) good.push(`${c}: cumpliste el ${P(v.d / v.p)} del tiempo planificado.`);
    if (s.best) good.push(`Tus mejores días son los ${DAYS[s.best.i]} (${P(s.best.a)}).`);

    // Puntos a mejorar
    if (s.index < 0.7) improve.push(`Índice promedio ${P(s.index)}${delta(s.index, prev.index)}: por debajo de la meta del 70 %.`);
    if (s.punct < 0.6 && s.doneT) improve.push(`Puntualidad ${P(s.punct)}: muchas tareas se cierran fuera de su bloque.`);
    if ((s.morning + s.late) / s.n > 0.4) improve.push(`Planificaste al levantarte o tarde en ${s.morning + s.late} de ${s.n} días (restó en tu nota).`);
    if (s.overdue / s.totalT > 0.3) improve.push(`${s.overdue} actividades quedaron sin hacer (${P(s.overdue / s.totalT)} del total).`);
    for (const [c, v] of Object.entries(s.cats)) if (v.p >= 300 && v.d / v.p < 0.6) improve.push(`${c}: solo cumpliste el ${P(v.d / v.p)} del tiempo planificado.`);
    if (s.worst && s.best && s.worst.i !== s.best.i && s.worst.a < 0.6) improve.push(`Los ${DAYS[s.worst.i]} rinden menos (${P(s.worst.a)}).`);
    if (s.reviews < 8) improve.push(`Pocos repasos registrados (${s.reviews}). La curva del olvido castiga los temas sin repaso.`);

    // Recomendaciones
    if (s.index < 0.7) recs.push('Planifica menos pero más realista: 3 a 5 actividades clave al día y bloques de 50 min con 10 de descanso.');
    if (s.punct < 0.6) recs.push('Marca cada tarea apenas termines y deja 10 minutos de margen entre bloques.');
    if ((s.morning + s.late) / s.n > 0.4) recs.push(`Usa el aviso de las ${Store.state.settings.planTime}: 10 minutos antes de dormir bastan para listar el día siguiente.`);
    if (s.worst && s.worst.a < 0.6) recs.push(`Aligera los ${DAYS[s.worst.i]}: mueve tareas pesadas a tus mejores días.`);
    const sem = Study.semester();
    const f = sem.focus[0];
    if (f) recs.push(`Prioriza ${f.s.name} (${f.s.credits} créditos, promedio ${f.g.avg?.toFixed(1) ?? '—'}): agenda al menos 3 bloques de estudio por semana.`);
    const upcoming = Store.state.subjects.flatMap(x => (x.exams || []).map(e => ({ x, e }))).filter(o => o.e.date >= ymd(new Date())).sort((a, b) => a.e.date < b.e.date ? -1 : 1)[0];
    if (upcoming) recs.push(`Prepara con tiempo ${upcoming.e.name} de ${upcoming.x.name} (${upcoming.e.date}); empieza los repasos 10 días antes.`);
    if (!recs.length) recs.push('Mantén el sistema: planifica de noche, cumple tus bloques y sube la meta diaria media hora.');

    return { s, prev, good, improve, recs, empty: false, title: `Informe de ${label(key)}` };
  }

  function voiceText(r) {
    if (r.empty) return `${r.title}: no hay actividades registradas en ese mes.`;
    const s = r.s;
    return `${r.title}. Calificación del mes: ${s.grade.toFixed(1)} de 10. Índice promedio ${P(s.index)}, puntualidad ${P(s.punct)}, ` +
      `nota de planificación ${s.planScore.toFixed(1)}. Cumpliste la meta en ${s.overGoal} de ${s.n} días. ` +
      (r.good.length ? `Fortalezas: ${r.good.slice(0, 2).join(' ')} ` : '') +
      (r.improve.length ? `Por mejorar: ${r.improve.slice(0, 2).join(' ')} ` : '') +
      `Recomendaciones: ${r.recs.slice(0, 3).join(' ')}`;
  }

  window.Monthly = { report, stats, voiceText, monthKey, shiftMonth, label };
})();
