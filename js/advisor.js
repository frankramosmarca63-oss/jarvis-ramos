/* Consejos del asistente: reglas sobre tus datos reales, ordenadas por urgencia.
   Cada consejo: { level: 'alta'|'media'|'info', text } */
(function () {
  const { ymd, addDays, toMin } = Store.util;

  function tips() {
    const out = [];
    const now = new Date();
    const today = ymd(now), tomorrow = addDays(today, 1);
    const nowM = now.getHours() * 60 + now.getMinutes();
    const s = Store.state.settings;
    const add = (level, text) => out.push({ level, text });

    // 1. Exámenes cercanos con baja preparación
    for (const sub of Store.state.subjects) {
      const ss = Study.subjectState(sub);
      if (ss.examIn == null) continue;
      const r = Math.round(ss.readiness * 100);
      if (ss.examIn <= 3 && r < 75) add('alta', `${ss.exam.name} de ${sub.name} en ${ss.examIn === 0 ? 'hoy' : ss.examIn + ' días'} y tu preparación es ${r} %. Dedica hoy bloques cortos de 40 min a: ${ss.topics.sort((a, b) => a.st.mastery - b.st.mastery).slice(0, 3).map(t => t.name).join(', ') || 'registrar los temas'}.`);
      else if (ss.examIn <= 10 && r < 60) add('media', `${sub.name}: examen en ${ss.examIn} días con ${r} % de preparación. Agenda al menos un repaso diario hasta esa fecha.`);
      if (!ss.topics.length && ss.examIn <= 21) add('media', `Registra los temas de ${sub.name} para poder medir tu preparación antes del examen.`);
    }

    // 2. Entregas próximas sin bloque agendado
    for (const p of Store.allPendings()) {
      if (!p.due) continue;
      const d = p.due.slice(0, 10);
      const days = Study.daysUntil(d);
      const scheduled = Store.state.tasks.some(t => t.pendingId === p.id);
      if (days < 0) add('alta', `La entrega "${p.title}" venció el ${d}. Márcala como hecha o descártala para mantener el plan limpio.`);
      else if (days <= 2 && !scheduled) add('alta', `"${p.title}" vence en ${days === 0 ? 'hoy' : days + ' días'} y no tiene bloque agendado.`);
      else if (days <= 7 && !scheduled) add('media', `Planifica con anticipación "${p.title}" (vence el ${d}).`);
    }

    // 3. Plan de mañana (desde la hora de planificación)
    if (nowM >= toMin(s.planTime) - 60) {
      const pl = Metrics.planning(tomorrow);
      if (pl.empty) add('alta', 'Aún no has listado las actividades de mañana. Hazlo antes de dormir para recibir los avisos.');
      else if (!pl.confirmed) add('media', `Mañana tienes ${Store.tasksFor(tomorrow).length} actividades. Revisa y pulsa "Confirmar plan" (nota actual ${pl.score}/10).`);
      if (pl.clashes) add('media', `${pl.clashes} actividad(es) de mañana chocan con comidas u otras tareas.`);
    }

    // 3b. Planificar al levantarse (se permite, pero resta)
    const cut = toMin(s.morningPlanUntil || '09:00');
    if (nowM < cut + 120 && !Store.state.planLog[today]) {
      add('media', nowM <= cut ? `No confirmaste el plan de hoy anoche. Aún puedes hacerlo hasta las ${s.morningPlanUntil || '09:00'} (vale 50 % en anticipación).`
        : 'Plan de hoy sin confirmar: si lo haces ahora vale solo 20 % en anticipación. Esta noche planifica mañana a tiempo.');
    }
    if (new Date().getDate() <= 3) add('info', 'Ya está disponible tu informe del mes anterior en AVANCE → INFORME MENSUAL.');

    // 4. Hoy
    const m = Metrics.day(today);
    if (m.overdue >= 2) add('media', `Tienes ${m.overdue} actividades de hoy vencidas sin marcar. Si ya las hiciste, márcalas; si no, reprográmalas.`);
    if (m.done >= 3 && m.punct < 0.5) add('info', 'Tu puntualidad está baja: prueba bloques más realistas (dura 25–50 min y deja 10 min de margen).');
    if (m.minPlan / 60 > (Number(s.dailyGoalHours) || 6) * 1.6) add('info', 'El plan de hoy está muy cargado. Prioriza lo de prioridad alta y mueve lo demás.');

    // 4b. Notas: curso con más peso y menor nota
    const sem = Study.semester();
    const f = sem.focus[0];
    if (f && f.g.avg != null && f.g.avg < 14) add('media', `Foco del semestre: ${f.s.name} (${f.g.avg.toFixed(1)}, ${f.s.credits} créditos). Para llegar a ${f.g.target} necesitas ${f.g.needTarget?.toFixed(1) ?? '—'} en las unidades que faltan.`);
    for (const x of sem.focus) if (x.g.needPass != null && x.g.needPass > 13) add('alta', `${x.s.name}: necesitas ${x.g.needPass.toFixed(1)} en lo que falta solo para aprobar.`);
    const mon = new Date().getDay() === 1;
    if (mon) add('info', 'Hoy es tu día de estudio: reparte bloques entre los cursos del foco y los repasos pendientes.');

    // 5. Repasos
    const q = Study.reviewQueue(3);
    if (q.length) add('info', `Repasos sugeridos hoy: ${q.map(x => `${x.topic.name} (${x.subject.name})`).join(' · ')}.`);

    // 6. Motivación
    const tot = Metrics.totals();
    if (tot.streak >= 3) add('info', `Llevas ${tot.streak} días seguidos sobre el 70 %. Mantén el ritmo.`);
    const ready = Store.state.rewards.find(r => Metrics.rewardStatus(r, tot).state === 'ready');
    if (ready) add('info', `Recompensa disponible: ${ready.label}. Te la ganaste.`);

    const order = { alta: 0, media: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  window.Advisor = { tips };
})();
