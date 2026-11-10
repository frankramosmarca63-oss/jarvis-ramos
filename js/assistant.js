/* Asistente conversacional de Jarvis.
   Responde por texto y por voz usando SOLO los datos reales de la app (tareas, horario, cursos, métricas).
   Funciona sin internet y sin costo: no es un modelo de IA, es un conjunto de reglas sobre tus datos.
   También ejecuta dos órdenes: agregar una actividad ("agrega repasar Termo mañana a las 8 por 2 horas")
   y marcar una como hecha ("ya terminé el informe"). */
(function () {
  const { ymd, parseYmd, toMin, fromMin, addDays, span } = Store.util;
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const pc = x => `${Math.round((x || 0) * 100)} %`;
  const who = () => Store.state.settings.name || 'Frank Ramos';
  const today = () => ymd(new Date());
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const left = m => m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const dayLabel = d => { const dt = parseYmd(d); return d === today() ? 'hoy' : d === addDays(today(), 1) ? 'mañana' : `el ${DAYS[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`; };
  const dueTxt = iso => { const d = Study.daysUntil(iso.slice(0, 10)); return d < 0 ? 'ya venció' : d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`; };

  // ---------- asignaturas ----------
  const GENERIC = new Set(['ingenieria', 'mecanica', 'investigacion', 'general', 'aplicada']);
  function findSubject(nq) {
    const words = nq.split(' ');
    for (const s of Store.state.subjects) {
      const keys = norm(s.name).split(' ').filter(w => w.length >= 5 && !GENERIC.has(w));
      if (keys.some(k => words.includes(k) || (k.length >= 10 && words.some(w => w.length >= 5 && k.startsWith(w))))) return s;
    }
    return null;
  }

  // ---------- respuestas ----------
  function nowNext() {
    const list = Store.tasksFor(today()), n = nowMin();
    if (!list.length) return `No tiene actividades planificadas para hoy, ${who()}. Le sugiero listarlas en la pestaña PLAN.`;
    const live = list.find(t => { const [s, e] = span(t.start, t.end); return n >= s && n < e && !t.doneAt; });
    const next = list.find(t => toMin(t.start) > n && !t.doneAt);
    const late = list.filter(t => !t.doneAt && span(t.start, t.end)[1] <= n);
    const out = [];
    if (live) out.push(`Ahora le toca ${live.title}, hasta las ${live.end}. Quedan ${left(span(live.start, live.end)[1] - n)}.`);
    if (next) out.push(`${live ? 'Después sigue' : 'Lo siguiente es'} ${next.title} a las ${next.start}, en ${left(toMin(next.start) - n)}.`);
    if (!live && !next) out.push(late.length ? 'No queda nada con hora pendiente hoy.' : `Plan del día completo, ${who()}. Buen trabajo.`);
    if (late.length) out.push(`Tiene ${plural(late.length, 'actividad vencida', 'actividades vencidas')} sin marcar: ${late.slice(0, 3).map(t => t.title).join(', ')}. Si ya ${late.length === 1 ? 'la hizo, márquela' : 'las hizo, márquelas'}; si no, reprográme${late.length === 1 ? 'la' : 'las'}.`);
    return out.join(' ');
  }

  function todayStatus() {
    const m = Metrics.day(today());
    if (!m.total) return `Hoy no hay actividades planificadas, así que no hay avance que medir, ${who()}. Agregue su plan y lo sigo.`;
    const goal = Metrics.STREAK_GOAL;
    const verdict = m.index >= goal ? 'Ya superó la meta del 70 %.' :
      m.done === m.total ? 'Completó todo, aunque fuera de hora.' : `Le faltan ${plural(m.total - m.done, 'actividad', 'actividades')} para cerrar el día; la meta es 70 %.`;
    return `Hoy lleva ${m.done} de ${m.total} actividades, ${who()}. Avance ${pc(m.avance)}${m.done ? `, puntualidad ${pc(m.punct)}` : ''}, índice de productividad ${pc(m.index)}. ${verdict}`;
  }

  function weekStatus() {
    const w = Metrics.range(7).filter(d => d.total);
    if (!w.length) return 'Todavía no hay días con actividades en los últimos 7 días.';
    const avg = Metrics.avgIndex(w), best = w.slice().sort((a, b) => b.index - a.index)[0], worst = w.slice().sort((a, b) => a.index - b.index)[0];
    const over = w.filter(d => d.index >= Metrics.STREAK_GOAL).length;
    const dn = d => DAYS[parseYmd(d.date).getDay()];
    return `En los últimos 7 días su índice promedio es ${pc(avg)}, ${who()}. Superó la meta en ${over} de ${plural(w.length, 'día', 'días')}. ` +
      `Mejor día: ${dn(best)} con ${pc(best.index)}.${w.length > 1 ? ` El más bajo: ${dn(worst)} con ${pc(worst.index)}.` : ''} ` +
      (avg >= 0.7 ? 'Va por buen camino.' : 'Conviene planificar menos bloques y cerrarlos todos.');
  }

  function monthStatus() {
    const r = Monthly.report(Monthly.monthKey(new Date()));
    if (r.empty) return 'Este mes todavía no tiene actividades registradas.';
    const s = r.s;
    return `Este mes va con calificación ${s.grade.toFixed(1)} sobre 10: índice ${pc(s.index)}, puntualidad ${pc(s.punct)} y planificación ${s.planScore.toFixed(1)} sobre 10. ` +
      `Superó la meta en ${s.overGoal} de ${s.n} días.${r.improve[0] ? ' Por mejorar: ' + r.improve[0] : ''}${r.recs[0] ? ' Recomendación: ' + r.recs[0] : ''}`;
  }

  function dayPlan(d) {
    const list = Store.tasksFor(d), lbl = dayLabel(d);
    const L = lbl[0].toUpperCase() + lbl.slice(1);
    if (!list.length) return `${L} no tiene actividades listadas, ${who()}.${d > today() ? ' Hágalo antes de dormir para la nota completa de planificación.' : ''}`;
    const pend = list.filter(t => !t.doneAt);
    const p = Metrics.planning(d);
    const items = (d === today() ? pend : list).slice(0, 6).map(t => `a las ${t.start}, ${t.title}`).join('; ');
    const head = d === today() ? `Hoy tiene ${plural(list.length, 'actividad', 'actividades')} y ${pend.length} por hacer` : `${L} tiene ${plural(list.length, 'actividad', 'actividades')}`;
    return `${head}: ${items || 'todo está hecho'}. Nota de planificación: ${p.score.toFixed(1)} sobre 10${Store.state.planLog[d] ? ', plan confirmado.' : d >= today() ? '. Aún falta confirmar el plan.' : '.'}`;
  }

  function planScore() {
    const t = Metrics.planning(today()), tm = Metrics.planning(addDays(today(), 1));
    const a = t.empty ? 'Hoy no tiene plan.' : `La nota de planificación de hoy es ${t.score.toFixed(1)} sobre 10, es decir ${pc(t.pct)} (confirmación: ${t.confirmedWhen}).`;
    const b = tm.empty ? 'Mañana aún no tiene actividades: planifique esta noche para obtener la nota completa.' : `La de mañana va en ${tm.score.toFixed(1)}${Store.state.planLog[addDays(today(), 1)] ? ', ya confirmada.' : '; confírmela antes de medianoche.'}`;
    return `${a} ${b}`;
  }

  function pendings() {
    const p = Store.allPendings();
    if (!p.length) return `No tiene entregas pendientes registradas, ${who()}.`;
    const noBlock = p.filter(x => x.due && Study.daysUntil(x.due.slice(0, 10)) <= 7 && !Store.state.tasks.some(t => t.pendingId === x.id)).length;
    return `Tiene ${plural(p.length, 'entrega pendiente', 'entregas pendientes')}: ` +
      p.slice(0, 5).map(x => `${x.title}${x.due ? ', ' + dueTxt(x.due) : ', sin fecha'}`).join('; ') + '.' +
      (noBlock ? ` ${plural(noBlock, 'de esta semana no tiene', 'de esta semana no tienen')} bloque agendado.` : '');
  }

  function exams() {
    const ex = Store.state.subjects.flatMap(s => (s.exams || []).filter(e => e.date >= today()).map(e => ({ s, e })))
      .sort((a, b) => a.e.date < b.e.date ? -1 : 1);
    if (!ex.length) return 'No hay exámenes próximos registrados. Agréguelos en CURSOS con el botón más EXAMEN.';
    return 'Exámenes próximos: ' + ex.slice(0, 4).map(x => {
      const d = Study.daysUntil(x.e.date), r = Study.subjectState(x.s).readiness;
      return `${x.e.name} de ${x.s.name}, ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días'}, preparación ${pc(r)}`;
    }).join('; ') + '.';
  }

  function grades(sub) {
    if (sub) {
      const g = Study.grades(sub), ss = Study.subjectState(sub);
      const base = g.avg == null ? `${sub.name} aún no tiene notas registradas.` : `En ${sub.name} su promedio es ${g.avg.toFixed(1)}.`;
      const need = g.avg == null || !g.left ? '' : g.needTarget > 20 ? ` La meta de ${g.target} ya no es alcanzable; para aprobar necesita ${g.needPass.toFixed(1)} en lo que falta.`
        : g.needTarget <= 0 ? ` La meta de ${g.target} ya está asegurada.` : ` Para llegar a ${g.target} necesita ${g.needTarget.toFixed(1)} en lo que falta.`;
      const ex = ss.exam ? ` Próximo examen en ${ss.examIn} días, preparación ${pc(ss.readiness)}.` : '';
      return base + need + ex;
    }
    const sem = Study.semester();
    if (sem.avg == null) return 'Todavía no hay notas registradas. Agréguelas en la pestaña CURSOS.';
    const f = sem.focus.slice(0, 2).map(x => `${x.s.name}${x.g.avg != null ? ' con ' + x.g.avg.toFixed(1) : ''}`).join(' y ');
    return `Su promedio ponderado es ${sem.avg.toFixed(2)} sobre 20, ${who()}.${f ? ` El foco de estudio sugerido es ${f}.` : ''}`;
  }

  function reviews() {
    const q = Study.reviewQueue(4);
    const f = Study.semester().focus[0];
    if (!q.length) return `No hay repasos pendientes hoy.${f ? ` Si tiene un bloque libre, dedíquelo a ${f.s.name}.` : ''}`;
    return `Repasos sugeridos para hoy: ${q.map(x => `${x.topic.name} de ${x.subject.name}`).join('; ')}.`;
  }

  function totals() {
    const t = Metrics.totals();
    const ready = Store.state.rewards.find(r => Metrics.rewardStatus(r, t).state === 'ready');
    const next = Store.state.rewards.filter(r => !r.claimed).sort((a, b) => a.pts - b.pts).find(r => t.available < r.pts);
    return `Tiene ${t.available} puntos disponibles, nivel ${t.level}, y una racha de ${plural(t.streak, 'día', 'días')} sobre el 70 %. ` +
      (ready ? `Ya puede canjear: ${ready.label}.` : next ? `Le faltan ${next.pts - t.available} puntos para: ${next.label}.` : 'No hay recompensas pendientes.');
  }

  function meals() {
    const m = Store.mealsFor(today()), n = nowMin();
    if (!m.length) return 'No tiene comidas registradas para hoy.';
    const nx = m.find(x => toMin(x.start) > n);
    return `Sus comidas de hoy: ${m.map(x => `${x.label.toLowerCase()} a las ${x.start}`).join(', ')}.${nx ? ` La siguiente es ${nx.label.toLowerCase()}, en ${left(toMin(nx.start) - n)}.` : ''}`;
  }

  function advice() {
    const t = Advisor.tips().slice(0, 3);
    if (!t.length) return `Todo en orden, ${who()}. Siga con su plan.`;
    return `Mi recomendación, ${who()}: ${t.map((x, i) => `${['Primero', 'Segundo', 'Tercero'][i]}, ${x.text[0].toLowerCase() + x.text.slice(1)}`).join(' ')}`;
  }

  function news() {
    const v = window.News?.forVoice();
    return v ? `Estas son las noticias. ${v}` : 'Las noticias del día aún no están disponibles en este equipo.';
  }

  const help = () => `Puede preguntarme, ${who()}: qué le toca ahora, cómo va hoy, esta semana o este mes, qué tiene mañana, sus entregas, exámenes, notas, repasos, puntos o noticias, o pedirme un consejo. ` +
    'También puedo agregar actividades, por ejemplo: agrega repasar Termodinámica mañana a las 8 por 2 horas; y marcarlas: ya terminé el informe.';

  // ---------- órdenes ----------
  const ADD = /^(?:por favor\s+)?(?:agr[eé]g[au](?:me|r)?|a[ñn]ad[ei](?:me|r)?|anota(?:me|r)?|apunta(?:me|r)?|programa(?:me|r)?|agenda(?:me|r)?|crea(?:me|r)?|pon(?:me|er)?|recu[eé]rdame)(?=\s|$)\s*/i;
  const DONE = /^(?:ya\s+)?(?:marca(?:r|me)?(?:\s+como\s+hech[ao])?|complet[eéa](?:r)?|termin[eéa](?:r)?|acab[eéa](?:r)?|hice|listo)(?=\s|$)\s*/i;

  function parseTime(h, m, mark, ctx) {
    let H = Number(h); const M = Number(m || 0);
    const pm = /p\.?\s?m|tarde|noche/i.test(mark || '') || (!mark && /(de|por|en) la (tarde|noche)/i.test(ctx));
    const am = /a\.?\s?m/i.test(mark || '') || (!mark && /(de|por|en) la ma[ñn]ana|madrugada/i.test(ctx));
    if (pm && H < 12) H += 12;
    else if (am && H === 12) H = 0;
    else if (!pm && !am && H >= 1 && H <= 4) H += 12; // "a las 3" casi siempre es de la tarde
    return H > 23 || M > 59 ? null : H * 60 + M;
  }

  function addTask(raw) {
    let t = raw.trim().replace(/^[¿¡\s]+|[?!.\s]+$/g, '').replace(ADD, '');
    t = t.replace(/^(?:una?\s+)?(?:nueva\s+)?(?:tarea|actividad|bloque|recordatorio)\b\s*(?:de|para|:)?\s*/i, '').replace(/^que\s+/i, '');
    const ctx = t;
    // día
    let date = today();
    const wd = norm(t).match(/\bel (lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (/\bpasado\s+ma[ñn]ana\b/i.test(t)) { date = addDays(today(), 2); t = t.replace(/\bpasado\s+ma[ñn]ana\b/i, ' '); }
    else if (wd) {
      const target = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].indexOf(wd[1]);
      let k = (target - new Date().getDay() + 7) % 7; if (k === 0) k = 7;
      date = addDays(today(), k); t = t.replace(/\bel\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i, ' ');
    }
    t = t.replace(/\b(?:de|por|en)\s+la\s+(?:ma[ñn]ana|tarde|noche|madrugada)\b/gi, ' ');
    if (/\bma[ñn]ana\b/i.test(t)) { if (date === today()) date = addDays(today(), 1); t = t.replace(/\b(?:para\s+)?ma[ñn]ana\b/i, ' '); }
    t = t.replace(/\b(?:para\s+)?hoy\b/i, ' ');
    // hora (rango "de 8 a 10" o "a las 8")
    const T = '(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)?';
    let start = null, end = null, m;
    if ((m = t.match(new RegExp(`\\b(?:de|desde)\\s+(?:las?\\s+)?${T}\\s+(?:a|hasta)\\s+(?:las?\\s+)?${T}`, 'i')))) {
      start = parseTime(m[1], m[2], m[3] || m[6], ctx); end = parseTime(m[4], m[5], m[6], ctx);
      if (start != null && end != null && end <= start && end + 720 > start && Number(m[4]) <= 12 && !m[6]) end += 720;
      t = t.replace(m[0], ' ');
    } else if ((m = t.match(new RegExp(`\\b(?:a|desde)\\s+las?\\s+${T}`, 'i'))) || (m = t.match(/\b(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i))) {
      start = parseTime(m[1], m[2], m[3], ctx); t = t.replace(m[0], ' ');
    }
    // duración
    let dur = 60;
    if ((m = t.match(/\b(?:por|durante)\s+(\d+(?:[.,]\d+)?|una|media)\s*(horas?|h|minutos?|min)\b/i))) {
      const v = /una/i.test(m[1]) ? 1 : /media/i.test(m[1]) ? 0.5 : Number(m[1].replace(',', '.'));
      dur = Math.round(/^h/i.test(m[2]) ? v * 60 : v); t = t.replace(m[0], ' ');
    }
    let title = t.replace(/\s+/g, ' ').replace(/^(?:de|para|que|a|el|la|:|-)\s+/i, '').replace(/\s+(?:a|de|para|por|el|la)$/i, '').trim();
    if (!title) return `¿Qué actividad agrego, ${who()}? Por ejemplo: agrega repasar Termodinámica mañana a las 8 por 2 horas.`;
    title = title[0].toUpperCase() + title.slice(1);
    if (start == null) return `¿A qué hora programo "${title}"? Dígamelo así: agrega ${title[0].toLowerCase() + title.slice(1)} ${date === today() ? 'hoy' : 'mañana'} a las 8.`;
    if (end == null) end = start + Math.max(5, Math.min(dur, 600));
    if (end > 1439) end = 1439;
    if (end <= start) return 'La hora de fin debe ser posterior a la de inicio. Repítame la actividad con sus horas.';

    const nt = norm(title), sub = findSubject(nt);
    const category = /\bclases?\b/.test(nt) ? 'Clase' : sub || /(estudi|repas|ejercicio|practica|informe|leer|resolver|examen)/.test(nt) ? 'Estudio'
      : /(gym|gimnasio|ejercit|correr|entren|deporte|futbol)/.test(nt) ? 'Salud' : /(video|reel|short|youtube|instagram|grabar|editar)/.test(nt) ? 'Contenido'
      : /(proyecto|jarvis|tesis|avim|simulacion|programa)/.test(nt) ? 'Proyecto' : 'Personal';
    const s = fromMin(start), e = fromMin(end);
    const clash = [...Store.tasksFor(date), ...Store.mealsFor(date)].find(x => { const [a, b] = span(x.start, x.end); return start < b && a < end; });
    Store.upsertTask({ title, start: s, end: e, category, priority: 2, rec: 'none', notes: '', subjectId: sub ? sub.id : '', topicId: '', pendingId: '', closesPending: false, date });
    return `Listo, ${who()}. Agregué "${title}" para ${dayLabel(date)}, de ${s} a ${e}, en ${category}.` +
      (clash ? ` Ojo: choca con ${clash.title || clash.label}.` : '') +
      (date === today() ? ' Como la agrega el mismo día, cuenta menos en su nota de planificación.' : ' Le avisaré con anticipación.');
  }

  function markDone(raw) {
    const list = Store.tasksFor(today()).filter(t => !t.doneAt), n = nowMin();
    if (!list.length) return `No tiene actividades pendientes hoy, ${who()}.`;
    const rest = norm(raw.replace(DONE, '')).replace(/\b(la|el|mi|una?|tarea|actividad|de|del|con|como|hech[ao]|ya|esto|eso)\b/g, ' ').replace(/\s+/g, ' ').trim();
    let hit = null;
    if (rest) {
      const words = rest.split(' ').filter(w => w.length >= 3);
      let best = 0;
      for (const t of list) { const nt = norm(t.title); const sc = words.filter(w => nt.includes(w)).length; if (sc > best) { best = sc; hit = t; } }
    } else hit = list.find(t => { const [s, e] = span(t.start, t.end); return n >= s && n < e; }) || (list.length === 1 ? list[0] : null);
    if (!hit) return `No encontré esa actividad entre las pendientes de hoy: ${list.slice(0, 5).map(t => t.title).join('; ')}. Dígame cuál.`;
    Store.toggleDone(hit.key);
    const m = Metrics.day(today());
    return `Hecho, ${who()}. Marqué "${hit.title}" como completada. Su índice de hoy sube a ${pc(m.index)}, con ${m.done} de ${m.total}.`;
  }

  // ---------- enrutador ----------
  function answer(question) {
    const raw = String(question || '').trim();
    const q = norm(raw);
    if (!q) return help();
    if (ADD.test(raw.replace(/^[¿¡\s]+/, ''))) return addTask(raw);
    if (DONE.test(raw.replace(/^[¿¡\s]+/, '')) && !/^listo$/.test(q)) return markDone(raw.replace(/^[¿¡\s]+/, ''));
    const has = re => re.test(q);
    if (has(/\b(como me llamo|quien soy|mi nombre)\b/)) return `Usted es ${who()}.`;
    if (has(/\b(quien eres|como te llamas|que eres|tu nombre)\b/)) return `Soy Jarvis, su asistente personal, ${who()}. Estoy pendiente de su plan, sus cursos y su avance.`;
    if (has(/\b(ayuda|que puedes|que sabes|comandos|que te puedo)\b/)) return help();
    if (has(/\b(noticias?|tendencias?)\b/)) return news();
    if (has(/\b(examen|examenes|parcial|parciales)\b/)) return exams();
    if (has(/\b(entregas?|pendientes?|trabajos|classroom)\b/)) return pendings();
    if (has(/planifi/)) return planScore();
    const sub = findSubject(q);
    if (sub || has(/\b(notas?|promedio|cursos?|asignaturas?)\b/)) return grades(sub);
    if (has(/\b(repasos?|repasar|estudio|estudiar)\b/)) return reviews();
    if (has(/\b(puntos?|racha|nivel|recompensas?|premios?)\b/)) return totals();
    if (has(/\b(comidas?|almuerzo|desayuno|cena|comer)\b/)) return meals();
    if (has(/\bmes\b|mensual/)) return monthStatus();
    if (has(/\bsemana/)) return weekStatus();
    if (has(/\bmanana\b/) && !has(/\b(esta|la|por la|en la) manana\b/)) return dayPlan(addDays(today(), 1));
    if (has(/\b(toca|sigue|siguiente|ahora|proxim[ao])\b/)) return nowNext();
    if (has(/\b(como voy|como estoy|productividad|avance|indice|rendimiento|progreso|porcentaje)\b/)) return todayStatus();
    if (has(/\b(consejo|recomiend\w*|aconsej\w*|asesor\w*|sugier\w*|que debo|que hago|ayudame)\b/)) return advice();
    if (has(/\b(hoy|horario|agenda|plan|actividades|tareas)\b/)) return dayPlan(today());
    if (has(/\b(hora|fecha|que dia)\b/)) { const n = new Date(); return `Son las ${fromMin(nowMin())} del ${DAYS[n.getDay()]} ${n.getDate()} de ${MONTHS[n.getMonth()]}.`; }
    if (has(/\bgracias\b/)) return `A la orden, ${who()}.`;
    if (has(/^(hola|buenos|buenas|hey|jarvis)\b/)) { const h = new Date().getHours(); return `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${who()}. ${nowNext()}`; }
    const tip = Advisor.tips()[0];
    return `No tengo una respuesta para eso, ${who()}. Puedo decirle qué le toca ahora, cómo va, qué tiene mañana, sus entregas, exámenes, notas o puntos, y agregar o marcar actividades.${tip ? ' Mientras tanto: ' + tip.text : ''}`;
  }

  // ---------- reconocimiento de voz ----------
  // Motor 1: dictado de Chrome/Edge (necesita internet y permiso de micrófono).
  // Motor 2 (opcional): uno externo registrado con Assistant.setEngine (p. ej. la vista de prueba en Claude).
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, engine = null, langs = ['es-PE', 'es-419', 'es-ES'];
  const canListen = () => !!engine || (!!SR && location.protocol !== 'file:');
  const MSG = {
    'not-allowed': 'Permita el micrófono: toque el candado junto a la dirección (o Ajustes del sitio) → Micrófono → Permitir, y vuelva a intentarlo.',
    'service-not-allowed': 'Este navegador no permite el dictado aquí. Use el micrófono de su teclado (Gboard) en el cuadro de pregunta.',
    'audio-capture': 'No detecto un micrófono. Revise que esté conectado y que Windows/Android le dé permiso a Chrome.',
    'no-speech': 'No escuché nada. Pulse HABLAR y hable apenas suene el pitido.',
    'network': 'El dictado necesita internet. Revise su conexión.',
    'aborted': '', 'unsupported': 'Este navegador no tiene dictado. Abra JARVIS en Google Chrome o use el micrófono del teclado.',
  };
  async function micPermission() {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      const ask = navigator.mediaDevices.getUserMedia({ audio: true });
      const st = await Promise.race([ask, new Promise((_, r) => setTimeout(() => r({ name: 'NotAllowedError' }), 25000))]);
      st.getTracks().forEach(t => t.stop()); return null;
    }
    catch (e) { return e && e.name === 'NotFoundError' ? 'audio-capture' : e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'not-allowed' : null; }
  }
  function stop() { if (engine) { engine.stop?.(); return; } if (rec) { try { rec.stop(); } catch { } } }
  const busy = () => !!rec || !!engine?.active?.();
  async function listen({ onText, onPartial, onState }) {
    const fail = code => onState?.('error', code, MSG[code] ?? 'No pude usar el micrófono. Inténtelo de nuevo.');
    if (engine) return engine.listen({ onText, onPartial, onState, fail });
    if (!SR || location.protocol === 'file:') { fail('unsupported'); return false; }
    if (rec) { stop(); return true; }
    onState?.('starting');
    const perm = await micPermission();
    if (perm) { fail(perm); onState?.('idle'); return false; }
    const run = li => {
      rec = new SR(); rec.lang = langs[li]; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      let finalTxt = '', err = null;
      rec.onstart = () => onState?.('listening');
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalTxt += t; else interim += t;
        }
        onPartial?.((finalTxt + ' ' + interim).trim());
      };
      rec.onerror = e => { err = e.error; };
      rec.onend = () => {
        rec = null;
        if (err === 'language-not-supported' && li + 1 < langs.length) { run(li + 1); return; }
        if (finalTxt.trim()) { onState?.('done'); onText?.(finalTxt.trim()); }
        else { if (err && err !== 'aborted') fail(err); else if (!err) fail('no-speech'); onState?.('idle'); }
      };
      try { rec.start(); } catch { rec = null; fail('aborted'); onState?.('idle'); }
    };
    run(0);
    return true;
  }
  const setEngine = e => { engine = e; };

  window.Assistant = { answer, listen, stop, busy, canListen, setEngine, MSG };
})();
