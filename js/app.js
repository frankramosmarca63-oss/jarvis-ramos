/* Interfaz del Jarvis */
(function () {
  const { ymd, parseYmd, toMin, fromMin, addDays, pad, span } = Store.util;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const PRIO_TXT = { 1: 'Baja', 2: 'Media', 3: 'Alta' };
  const COLORS = ['#4ff3ff', '#ffc857', '#5dffa8', '#ff8a5c', '#b48cff', '#ff5ea8', '#7cc4ff'];
  const pct = (x, d = 0) => `${(x * 100).toFixed(d)} %`;
  const today = () => ymd(new Date());
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const fmtDay = s => { const d = parseYmd(s); return `${DAYS[d.getDay()].slice(0, 3).toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()}`; };
  const fmtLeft = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`;
  const fmtDue = iso => { if (!iso) return 'sin fecha'; const d = iso.slice(0, 10), n = Study.daysUntil(d); const t = iso.length > 10 ? ' ' + iso.slice(11, 16) : ''; return n < 0 ? `venció ${fmtDay(d)}` : n === 0 ? `hoy${t}` : n === 1 ? `mañana${t}` : `${fmtDay(d)} (${n} d)`; };
  const subjName = id => Store.state.subjects.find(s => s.id === id)?.name || '';

  const ui = {
    view: (() => { try { return localStorage.getItem('jarvis-view') || 'inicio'; } catch { return 'inicio'; } })(),
    hoyDate: today(), planDate: new Date().getHours() >= 15 ? addDays(today(), 1) : today(), progDate: today(),
    newsTab: 'local', trendTab: 'mineria', month: Monthly.monthKey(new Date()),
  };

  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3800);
  }

  // ============ navegación ============
  function show(view) {
    ui.view = view;
    try { localStorage.setItem('jarvis-view', view); } catch { }
    $$('.view').forEach(v => v.hidden = v.id !== 'view-' + view);
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    render();
    window.scrollTo({ top: 0 });
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view); });

  // ============ reloj ============
  function renderClock() {
    const n = new Date();
    $('#clockTime').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
    $('#clockDate').textContent = `${DAYS[n.getDay()]} ${n.getDate()} ${MONTHS[n.getMonth()].slice(0, 3)}`;
  }

  // ============ INICIO ============
  function saludo() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

  function greeting() {
    const name = Store.state.settings.name || 'Frank Ramos';
    const m = Metrics.day(today());
    const pending = m.total - m.done;
    if (!m.total) return `${saludo()}, ${name}. No hay actividades planificadas para hoy.`;
    if (!pending) return `${saludo()}, ${name}. Plan del día completado: índice ${pct(m.index, 1)}.`;
    return `${saludo()}, ${name}. ${pending} ${pending === 1 ? 'actividad pendiente' : 'actividades pendientes'} · índice ${pct(m.index, 1)}.`;
  }

  function briefingText() {
    const s = Store.state.settings, name = s.name || 'Frank Ramos';
    const n = new Date();
    const parts = [`${saludo()}, ${name}. Hoy es ${DAYS[n.getDay()]} ${n.getDate()} de ${MONTHS[n.getMonth()]}.`];
    const nv = News.forVoice();
    parts.push(nv ? `Estas son las noticias más importantes. ${nv}` : 'Las noticias del día aún no están disponibles.');
    const list = Store.tasksFor(today()).filter(t => !t.doneAt);
    if (list.length) {
      parts.push(`Para hoy tiene ${list.length} ${list.length === 1 ? 'actividad pendiente' : 'actividades pendientes'}. ` +
        list.slice(0, 4).map(t => `A las ${t.start}, ${t.title}`).join('. ') + '.');
    } else parts.push('No tiene actividades planificadas para hoy. Le sugiero listarlas ahora.');
    const meals = Store.mealsFor(today());
    if (meals.length) parts.push(`Sus comidas: ${meals.map(m => `${m.label.toLowerCase()} a las ${m.start}`).join(', ')}.`);
    const due = Store.allPendings().filter(p => p.due && Study.daysUntil(p.due.slice(0, 10)) <= 3 && Study.daysUntil(p.due.slice(0, 10)) >= 0);
    if (due.length) parts.push(`Entregas próximas: ${due.slice(0, 3).map(p => `${p.title}, ${fmtDue(p.due)}`).join('. ')}.`);
    const tip = Advisor.tips()[0];
    if (tip) parts.push(`Recomendación: ${tip.text}`);
    parts.push('Eso es todo. Que tenga un excelente día.');
    return parts.join(' ');
  }

  function playBriefing() {
    const orb = $('#briefBtn');
    if (Voice.speaking()) { Voice.stop(); orb.classList.remove('talking'); $('#briefState').textContent = 'Informe detenido'; return; }
    if (!Voice.available() || !Store.state.settings.voice) { toast('La voz está desactivada o no disponible en este navegador.'); return; }
    orb.classList.add('talking'); $('#briefState').textContent = 'Reproduciendo informe… (toca para detener)';
    Voice.speak(briefingText(), { onEnd: () => { orb.classList.remove('talking'); $('#briefState').textContent = 'Informe completado'; } });
    Store.state.briefed[today()] = new Date().toISOString(); Store.save();
  }
  $('#briefBtn').onclick = playBriefing;

  function newsItemsHtml(id) {
    const it = News.items(id);
    if (!it.length) {
      const why = location.protocol === 'file:' ? 'Abre la app con iniciar.bat para cargar noticias.' :
        !News.data.generated ? 'Las noticias se activan cuando subas la app a GitHub (GUIA_INSTALACION.md, paso 4).' : 'Sin noticias en esta sección hoy.';
      return `<li class="muted">${why}</li>`;
    }
    return it.slice(0, 8).map(x => `<li><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a><div class="src">${esc(x.source || '')}${x.date ? ' · ' + esc(new Date(x.date).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</div></li>`).join('');
  }
  function segHtml(defs, active) { return defs.map(d => `<button data-seg="${d.id}" class="${d.id === active ? 'on' : ''}">${d.label}</button>`).join(''); }

  function renderInicio() {
    $('#greetText').textContent = greeting();
    const t = Store.tasksFor(today()).filter(x => !x.doneAt);
    $('#briefSummary').textContent = t.length ? `Siguiente: ${t.find(x => span(x.start, x.end)[1] > nowMin())?.title || t[0].title}` : 'Planifica tu día en la pestaña PLAN.';
    if (!Voice.speaking() && !Store.state.briefed[today()]) $('#briefState').textContent = 'Toca el núcleo para escuchar tu informe del día';
    $('#newsTabs').innerHTML = segHtml(News.NEWS, ui.newsTab);
    $('#trendTabs').innerHTML = segHtml(News.TRENDS, ui.trendTab);
    $('#newsList').innerHTML = newsItemsHtml(ui.newsTab);
    $('#trendList').innerHTML = newsItemsHtml(ui.trendTab);
    $('#newsStamp').textContent = News.data.generated ? `Actualizado ${new Date(News.data.generated).toLocaleString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : '';

    const hm = Metrics.day(today()), hp = Metrics.planning(addDays(today(), 1)), ht = Metrics.totals(), hw = Metrics.avgIndex(Metrics.range(7));
    const kp = (k, l, v) => `<div class="bm"><span class="k">${k}</span><span class="l">${l}</span><div class="mini"><div style="width:${Math.round(Math.min(1, Math.max(0, v)) * 100)}%"></div></div></div>`;
    $('#homeKpis').innerHTML = kp(hm.total ? pct(hm.index) : '—', `Índice de hoy · ${hm.done}/${hm.total} tareas`, hm.index) +
      kp(pct(hw), 'Promedio 7 días · meta 70 %', hw) +
      kp(hp.empty ? '—' : `${hp.score.toFixed(1)}/10`, 'Plan de mañana', hp.empty ? 0 : hp.pct) +
      kp(`${ht.streak} d`, `Racha · ${ht.available} pts · nivel ${ht.level}`, ht.levelProgress);

    const tips = Advisor.tips();
    $('#tipsList').innerHTML = tips.length ? tips.slice(0, 6).map(t => `<li class="${t.level}">${esc(t.text)}</li>`).join('') : '<li>Todo en orden. Sigue con tu plan.</li>';

    const pend = Store.allPendings().slice(0, 5);
    $('#homePendings').innerHTML = pend.length ? pend.map(p => `<li><div class="grow">${esc(p.title)}<div class="sub">${esc(subjName(p.subjectId) || p.courseName || '')} · ${fmtDue(p.due)}</div></div>${dueBadge(p.due)}</li>`).join('') : '<li class="muted">Sin entregas pendientes.</li>';

    const exams = Store.state.subjects.flatMap(s => (s.exams || []).filter(e => e.date >= today()).map(e => ({ s, e, ss: Study.subjectState(s) })))
      .sort((a, b) => a.e.date < b.e.date ? -1 : 1).slice(0, 4);
    $('#homeExams').innerHTML = exams.length ? exams.map(x => `<li><div class="grow">${esc(x.e.name)} · ${esc(x.s.name)}<div class="sub">${fmtDay(x.e.date)} · preparación ${pct(x.ss.readiness)}</div></div><span class="badge ${Study.daysUntil(x.e.date) <= 3 ? 'red' : 'gold'}">${Study.daysUntil(x.e.date)} d</span></li>`).join('') : '<li class="muted">Registra tus exámenes en CURSOS.</li>';
  }
  const dueBadge = due => { if (!due) return ''; const n = Study.daysUntil(due.slice(0, 10)); return `<span class="badge ${n < 0 ? 'red' : n <= 2 ? 'red' : n <= 7 ? 'gold' : 'cyan'}">${n < 0 ? 'VENCIDA' : n + ' d'}</span>`; };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-seg]'); if (!b) return;
    if (b.parentElement.id === 'newsTabs') ui.newsTab = b.dataset.seg; else ui.trendTab = b.dataset.seg;
    renderInicio();
  });

  // ============ HOY ============
  function renderReactor() {
    const m = Metrics.day(ui.hoyDate);
    const p = Math.round(m.index * 100);
    $('#ringMain').style.strokeDasharray = `${p} 100`;
    $('#ringPunct').style.strokeDasharray = `${Math.round(m.punct * 100)} 100`;
    $('#pctText').textContent = `${(m.index * 100).toFixed(m.index > 0 && m.index < 1 ? 1 : 0)}%`;
    $('#coreGlow').style.opacity = String(0.35 + 0.65 * m.index);
    $('#kAvance').textContent = pct(m.avance, 1);
    $('#kPunct').textContent = m.done ? pct(m.punct) : '—';
    $('#kCount').textContent = `${m.done}/${m.total}`;
    $('#reactorTitle').textContent = ui.hoyDate === today() ? 'PRODUCTIVIDAD HOY' : `PRODUCTIVIDAD · ${fmtDay(ui.hoyDate)}`;
  }

  function currentAndNext() {
    const list = Store.tasksFor(today()), n = nowMin();
    const live = list.find(t => { const [s, e] = span(t.start, t.end); return n >= s && n < e && !t.doneAt; });
    const next = list.find(t => toMin(t.start) > n && !t.doneAt && t !== live);
    return { live, next };
  }

  function renderNow() {
    const { live, next } = currentAndNext(), n = nowMin();
    if (live) {
      const [s, e] = span(live.start, live.end);
      $('#nowBox').innerHTML = `<div class="t">${esc(live.title)}</div>
        <div class="meta">${live.start}–${live.end} · ${esc(live.category)} · Prioridad ${PRIO_TXT[live.priority]}${live.subjectId ? ' · ' + esc(subjName(live.subjectId)) : ''}</div>
        <div class="count">QUEDAN ${fmtLeft(e - n)}</div>
        <div class="progress"><div style="width:${Math.min(100, ((n - s) / (e - s)) * 100)}%"></div></div>
        <button class="btn" style="margin-top:12px;width:100%" data-done="${live.key}">MARCAR COMO HECHA</button>`;
    } else {
      const meal = Store.mealsFor(today()).find(m => { const [s, e] = span(m.start, m.end); return n >= s && n < e; });
      $('#nowBox').innerHTML = meal ? `<div class="t">${esc(meal.label)}</div><div class="meta">${meal.start}–${meal.end} · Alimentación</div>` : `<div class="empty">Sin actividad en este momento.</div>`;
    }
    $('#nextBox').innerHTML = next ? `<div class="t">${esc(next.title)}</div><div class="meta">${next.start}–${next.end} · ${esc(next.category)}</div><div class="count">EN ${fmtLeft(toMin(next.start) - n)}</div>`
      : `<div class="empty">No hay más actividades hoy.</div>`;
  }

  function renderPilot() {
    const t = Metrics.totals();
    $('#sStreak').textContent = t.streak;
    $('#sPoints').textContent = t.available;
    $('#sLevel').textContent = t.level;
    $('#levelBar').style.width = `${Math.round(t.levelProgress * 100)}%`;
    $('#levelHint').textContent = `${t.points} pts ganados en total · faltan ${t.toNext} para el nivel ${t.level + 1}`;
    const q = Study.reviewQueue(5);
    $('#reviewList').innerHTML = q.length ? q.map(x => `<li><div class="grow">${esc(x.topic.name)}<div class="sub">${esc(x.subject.name)} · retención ${pct(x.topic.st.retention)}${x.examIn != null ? ' · examen en ' + x.examIn + ' d' : ''}</div></div><button class="xs" data-review="${x.topic.id}">REPASÉ</button></li>`).join('')
      : '<li class="muted">Sin repasos pendientes.</li>';
  }

  function timelineHtml(dateStr, { withMeals = true } = {}) {
    const list = Store.tasksFor(dateStr), meals = withMeals ? Store.mealsFor(dateStr) : [];
    const isToday = dateStr === today(), n = nowMin();
    const rows = [
      ...list.map(t => ({ kind: 'task', t, s: toMin(t.start) })),
      ...meals.map(m => ({ kind: 'meal', m, s: toMin(m.start) })),
    ].sort((a, b) => a.s - b.s);
    if (!list.length && !meals.length) return `<li class="empty">No hay actividades para este día.</li>`;
    return rows.map(r => {
      if (r.kind === 'meal') return `<li class="item meal"><div class="ih">${r.m.start}<br>${r.m.end}</div><div><div class="it">${esc(r.m.label)}</div><div class="ic">Alimentación · bloque fijo</div></div><span></span></li>`;
      const t = r.t, [s, e] = span(t.start, t.end);
      const live = isToday && n >= s && n < e && !t.doneAt;
      const late = !t.doneAt && (dateStr < today() || (isToday && n >= e));
      const clash = meals.some(m => { const [a, b] = span(m.start, m.end); return s < b && a < e; });
      const rec = { daily: ' · diaria', weekdays: ' · L–V', weekly: ' · semanal' }[t.rec] || '';
      const extra = [t.subjectId && subjName(t.subjectId), t.topicId && '↻ repaso', t.pendingId && '⧉ entrega'].filter(Boolean).join(' · ');
      return `<li class="item p${t.priority} ${t.doneAt ? 'done' : ''} ${live ? 'live' : ''} ${late ? 'late' : ''} ${clash ? 'clash' : ''}" data-edit="${t.id}">
        <div class="ih">${t.start}<br>${t.end}</div>
        <div><div class="it">${esc(t.title)}</div><div class="ic">${esc(t.category)} · ${PRIO_TXT[t.priority]}${rec}${extra ? ' · ' + esc(extra) : ''}${clash ? ' · <span style="color:var(--red)">choca con comida</span>' : ''}${t.doneAt ? (Metrics.onTime(t) ? ' · a tiempo' : ' · fuera de hora') : ''}</div></div>
        <button class="check ${t.doneAt ? 'on' : ''}" data-done="${t.key}" aria-label="Marcar como hecha">${t.doneAt ? '✓' : ''}</button>
      </li>`;
    }).join('');
  }

  function renderHoy() {
    renderReactor(); renderNow(); renderPilot();
    $('#dayLabel').textContent = fmtDay(ui.hoyDate);
    $('#timeline').innerHTML = timelineHtml(ui.hoyDate);
  }

  // ============ PLAN ============
  function renderPlan() {
    const d = ui.planDate;
    $('#planTitle').textContent = d === addDays(today(), 1) ? 'PLAN DE MAÑANA' : d === today() ? 'PLAN DE HOY' : 'PLAN DEL DÍA';
    $('#planDayLabel').textContent = fmtDay(d);
    $('#planTimeline').innerHTML = timelineHtml(d);
    const p = Metrics.planning(d);
    $('#planScore').textContent = p.empty ? '—' : p.score.toFixed(1);
    const row = (label, v, val, gold) => `<div class="brow"><span>${label}</span><b>${val}</b><div class="bb ${gold ? 'gold' : ''}"><div style="width:${Math.round(v * 100)}%"></div></div></div>`;
    $('#planBreak').innerHTML = p.empty ? '<div class="muted">Agrega actividades para calcular la nota.</div>' :
      row('Nota en porcentaje', p.pct, pct(p.pct, 1), true) +
      row(`Anticipación (40 %) · tareas ${pct(p.early)} · confirmación: ${p.confirmedWhen}`, p.an, pct(p.an)) +
      row(`Cobertura de entregas (30 %) · ${p.coveredCount}/${p.dueCount}`, p.co, pct(p.co)) +
      row(`Equilibrio (30 %) · ${p.hours.toFixed(1)} h comprometidas (${pct(p.load)}) · ${p.ownH.toFixed(1)} h propias${p.clashes ? ` · ${p.clashes} choque(s)` : ''}`, p.eq, pct(p.eq)) +
      `<div class="muted small">${p.confirmed ? '✓ Plan confirmado la noche anterior (+15 pts)' :
        p.confirmV === 0.5 ? '◐ Plan confirmado al levantarse: vale la mitad en anticipación (+5 pts)' :
        p.confirmV > 0 ? '◔ Plan confirmado durante el día: anticipación baja' :
        d > today() ? 'Confírmalo antes de medianoche para la nota completa (+15 pts).' :
        d === today() ? `Aún puedes planificar hoy, pero resta: hasta las ${Store.state.settings.morningPlanUntil || '09:00'} vale 50 %, después 20 %.` : 'Este plan no se confirmó.'}</div>`;
    const confirmed = Store.state.planLog[d];
    $('#confirmPlan').textContent = confirmed ? 'PLAN CONFIRMADO ✓' : 'CONFIRMAR PLAN';
    const toSch = Store.allPendings().filter(p => !Store.state.tasks.some(t => t.pendingId === p.id)).slice(0, 8);
    $('#toSchedule').innerHTML = toSch.length ? toSch.map(p => `<li><div class="grow">${esc(p.title)}<div class="sub">${fmtDue(p.due)}</div></div><button class="xs" data-schedule="${esc(p.id)}">AGENDAR</button></li>`).join('') : '<li class="muted">Todas las entregas tienen bloque.</li>';
  }

  $('#confirmPlan').onclick = () => {
    const d = ui.planDate;
    if (!Store.tasksFor(d).length) { toast('Agrega al menos una actividad antes de confirmar.'); return; }
    Store.state.planLog[d] = new Date().toISOString(); Store.save();
    const p = Metrics.planning(d);
    const extra = p.confirmV === 1 ? ' +15 pts por planificar la noche anterior.' : p.confirmV === 0.5 ? ' Planificado al levantarse: anticipación al 50 %.' : ' Planificado tarde: anticipación al 20 %.';
    toast(`Plan confirmado. Nota: ${p.score.toFixed(1)}/10 (${pct(p.pct)}).${extra}`);
    if (Voice.available() && Store.state.settings.voice) Voice.speak(`Plan confirmado, ${Store.state.settings.name}. Su nota de planificación es ${p.score.toFixed(1)} de 10. Le avisaré cada actividad. Descanse.`);
  };
  $('#copyYesterday').onclick = () => {
    const prev = addDays(ui.planDate, -1);
    const src = Store.state.tasks.filter(t => (t.rec === 'none' || !t.rec) && t.date === prev);
    if (!src.length) { toast('El día anterior no tiene actividades únicas para copiar.'); return; }
    src.forEach(t => { const { id, created, ...rest } = t; Store.upsertTask({ ...rest, date: ui.planDate }); });
    toast(`${src.length} actividades copiadas.`);
  };

  // ============ CURSOS ============
  function stars(n, topicId) { return `<span class="stars" data-stars="${topicId}" title="Confianza: toca para cambiar">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; }

  const g2 = x => x == null ? '—' : Number(x).toFixed(2);
  function renderSemester() {
    const sem = Study.semester();
    const focus = sem.focus.slice(0, 3).map((f, i) => `${i + 1}. ${esc(f.s.name)} (${g2(f.g.avg)} · ${f.s.credits} cr)`).join('<br>');
    $('#semesterBox').innerHTML = `<div class="sem-grid">
      <div class="bm"><span class="k gold">${g2(sem.avg)}</span><span class="l">Promedio ponderado (${sem.gradedCredits}/${sem.credits} créditos con nota)</span></div>
      <div class="bm"><span class="k">${sem.avg == null ? '—' : pct(sem.avg / 20, 1)}</span><span class="l">Rendimiento sobre 20</span></div>
      <div class="bm left"><span class="l">Foco de estudio sugerido (créditos × nota × examen × preparación)</span><span class="small">${focus || '—'}</span></div>
    </div>`;
  }

  function gradeHtml(s) {
    const g = Study.grades(s);
    if (!(s.units || []).length) return '';
    const chips = s.units.map(u => `<span class="badge ${u.grade == null || u.grade === '' ? 'cyan' : Number(u.grade) >= 14 ? 'green' : Number(u.grade) >= 10.5 ? 'gold' : 'red'}">${esc(u.name.replace('Unidad ', 'U'))}: ${u.grade == null || u.grade === '' ? '—' : Number(u.grade).toFixed(1)}</span>`).join(' ');
    const need = g.left ? (g.needTarget > 20 ? `meta ${g.target} ya no alcanzable; para aprobar necesitas ${g2(g.needPass)}` : g.needTarget <= 0 ? `meta ${g.target} asegurada` : `para llegar a ${g.target} necesitas ${g2(g.needTarget)} en lo que falta`) : 'curso cerrado';
    return `<div class="grades"><div>${chips}</div><div class="muted small">Promedio ${g2(g.avg)} · ${s.credits || 0} créditos · ${need}</div></div>`;
  }

  function renderCursos() {
    renderSemester();
    const subs = Store.state.subjects;
    $('#subjectList').innerHTML = subs.length ? subs.map(s => {
      const ss = Study.subjectState(s);
      const topics = ss.topics.map(t => `<div class="topic">
          <span>${esc(t.name)} <span class="muted small">· ${t.st.n} repasos${t.st.n ? ' · próximo ' + (t.st.dueNow ? '<b style="color:var(--gold)">hoy</b>' : fmtDay(t.st.nextReview)) : ''}</span></span>
          <span>${stars(Number(t.confidence) || 1, t.id)} <button class="xs" data-review="${t.id}">REPASÉ</button> <button class="xs" data-edit-topic="${t.id}">✎</button></span>
          <div class="tbar"><div style="width:${Math.round(t.st.mastery * 100)}%"></div></div>
        </div>`).join('');
      return `<div class="subj" style="--c:${s.color || COLORS[0]}">
        <div class="subj-head">
          <div><div class="subj-name">${esc(s.name)}</div><div class="muted small">${esc(s.teacher || '')}${ss.exam ? ` · ${esc(ss.exam.name)}: ${fmtDay(ss.exam.date)} (${ss.examIn} d)` : ''}</div></div>
          <div style="text-align:right"><div class="ready">${pct(ss.readiness)}</div><div class="muted small">preparación</div></div>
        </div>
        ${gradeHtml(s)}
        <div class="muted small">Temas estudiados: ${pct(ss.coverage)} · por repasar hoy: ${ss.due.length}</div>
        ${topics || '<div class="muted small mt">Sin temas. Agrega los temas del sílabo.</div>'}
        <div class="subj-acts">
          <button class="xs" data-add-topic="${s.id}">+ TEMA</button>
          <button class="xs gold" data-add-exam="${s.id}">+ EXAMEN</button>
          <button class="xs" data-edit-subject="${s.id}">EDITAR</button>
          ${(s.exams || []).map(e => `<button class="xs" data-edit-exam="${s.id}|${e.id}">${esc(e.name)} ✎</button>`).join('')}
        </div>
      </div>`;
    }).join('') : '<div class="muted">Registra tus asignaturas con “+ ASIGNATURA”. Luego agrega sus temas y fechas de examen.</div>';

    const sv = Store.server;
    $('#syncInfo').textContent = sv.lastSync ? `Classroom/Gmail sincronizados: ${new Date(sv.lastSync).toLocaleString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` :
      Cloud.configured ? 'Classroom/Gmail: pendiente de configurar (GUIA_INSTALACION.md, paso 5).' : 'Conecta la nube para traer Classroom y Gmail automáticamente.';
    const pend = Store.allPendings();
    $('#pendingList').innerHTML = pend.length ? pend.map(p => `<li><div class="grow">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title)}
        <div class="sub">${esc(subjName(p.subjectId) || p.courseName || '')} · ${fmtDue(p.due)} · ${{ classroom: 'Classroom', gmail: 'Gmail', manual: 'manual' }[p.source] || p.source}</div></div>
        <div class="acts">${dueBadge(p.due)}<button class="xs" data-schedule="${esc(p.id)}">AGENDAR</button><button class="xs gold" data-pdone="${esc(p.id)}">HECHA</button>${p.source === 'manual' ? `<button class="xs" data-pedit="${esc(p.id)}">✎</button>` : `<button class="xs" data-pdismiss="${esc(p.id)}">✕</button>`}</div></li>`).join('')
      : '<li class="muted">Sin pendientes.</li>';
    const emails = (sv.emails || []).filter(m => !Store.state.pendingState[m.id]);
    $('#emailList').innerHTML = emails.length ? emails.slice(0, 10).map(m => `<li><div class="grow">${esc(m.subject)}<div class="sub">${esc(m.from)}${m.detectedDue ? ' · fecha detectada: ' + fmtDay(m.detectedDue) : ''}</div></div><div class="acts"><button class="xs gold" data-email-add="${esc(m.id)}">A PENDIENTES</button><button class="xs" data-pdismiss="${esc(m.id)}">✕</button></div></li>`).join('')
      : '<li class="muted">Sin correos de cursos por revisar.</li>';
  }

  // ============ AVANCE ============
  function renderProgreso() {
    const d = ui.progDate, m = Metrics.day(d), p = Metrics.planning(d);
    $('#progDayLabel').textContent = fmtDay(d);
    const bm = (k, l, gold) => `<div class="bm"><span class="k ${gold ? 'gold' : ''}">${k}</span><span class="l">${l}</span></div>`;
    $('#bigMetrics').innerHTML =
      bm(pct(m.index, 1), 'Índice de productividad') + bm(pct(m.avance, 1), 'Avance ponderado') +
      bm(m.done ? pct(m.punct, 1) : '—', 'Puntualidad', true) + bm(p.empty ? '—' : `${p.score.toFixed(1)}/10`, 'Nota de planificación', true) +
      bm(`${m.done}/${m.total}`, 'Tareas hechas') + bm(`${(m.minDone / 60).toFixed(1)} / ${(m.minPlan / 60).toFixed(1)} h`, 'Horas hechas / planificadas') +
      bm(`${m.punctual} · ${m.late}`, 'A tiempo · fuera de hora') + bm(String(m.overdue), 'Vencidas sin marcar');
    const cats = Object.entries(m.byCat).sort((a, b) => b[1].planned - a[1].planned);
    $('#catTable').innerHTML = cats.length ? cats.map(([c, v]) => `<div class="brow"><span>${esc(c)} · ${v.doneCount}/${v.count} tareas · ${(v.done / 60).toFixed(1)} de ${(v.planned / 60).toFixed(1)} h</span><b>${pct(v.done / v.planned, 1)}</b><div class="bb"><div style="width:${(v.done / v.planned) * 100}%"></div></div></div>`).join('')
      : '<div class="muted">Sin actividades este día.</div>';

    // semana
    const data = Metrics.range(7);
    const W = 320, H = 170, padB = 24, padT = 16, gap = 10, bw = (W - gap * 8) / 7, ch = H - padB - padT;
    let svg = `<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8A1F"/><stop offset="1" stop-color="#E8257F" stop-opacity=".55"/></linearGradient></defs>`;
    const gy = padT + ch * (1 - Metrics.STREAK_GOAL);
    svg += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="rgba(255,200,87,.7)" stroke-dasharray="4 4"/>`;
    data.forEach((x, i) => {
      const X = gap + i * (bw + gap), h = Math.max(2, ch * x.index), y = H - padB - h;
      svg += `<rect class="bar-r" x="${X}" y="${y}" width="${bw}" height="${h}" rx="2" opacity="${x.total ? 1 : .25}"><title>${fmtDay(x.date)}: ${pct(x.index, 1)}</title></rect>`;
      svg += `<text x="${X + bw / 2}" y="${H - 8}" text-anchor="middle">${DAYS[parseYmd(x.date).getDay()].slice(0, 2).toUpperCase()}</text>`;
      if (x.total) svg += `<text class="val" x="${X + bw / 2}" y="${y - 4}" text-anchor="middle">${Math.round(x.index * 100)}</text>`;
    });
    $('#weekChart').innerHTML = svg;
    const wAvg = Metrics.avgIndex(data);
    $('#weekAvg').textContent = `Promedio semanal: ${pct(wAvg, 1)} · línea punteada = meta 70 %`;

    const month = Metrics.range(30), withPlan = month.filter(x => x.total);
    const best = withPlan.slice().sort((a, b) => b.index - a.index)[0];
    const sum = withPlan.reduce((a, x) => ({ done: a.done + x.m.done, total: a.total + x.m.total, h: a.h + x.m.minDone }), { done: 0, total: 0, h: 0 });
    const planAvg = withPlan.length ? withPlan.reduce((a, x) => a + Metrics.planning(x.date).score, 0) / withPlan.length : 0;
    const row = (l, v, val, gold) => `<div class="brow"><span>${l}</span><b>${val}</b><div class="bb ${gold ? 'gold' : ''}"><div style="width:${Math.round(v * 100)}%"></div></div></div>`;
    $('#monthBox').innerHTML = withPlan.length ?
      row('Índice promedio', Metrics.avgIndex(month), pct(Metrics.avgIndex(month), 1)) +
      row(`Días sobre la meta · ${withPlan.filter(x => x.index >= Metrics.STREAK_GOAL).length}/${withPlan.length}`, withPlan.filter(x => x.index >= Metrics.STREAK_GOAL).length / withPlan.length, pct(withPlan.filter(x => x.index >= Metrics.STREAK_GOAL).length / withPlan.length)) +
      row('Nota de planificación promedio', (planAvg - 1) / 9, `${planAvg.toFixed(1)}/10`, true) +
      `<div class="muted small">${sum.done}/${sum.total} tareas · ${(sum.h / 60).toFixed(1)} h productivas${best ? ` · mejor día ${fmtDay(best.date)} (${pct(best.index)})` : ''}</div>`
      : '<div class="muted">Aún no hay historial.</div>';

    renderTrend(month);
    renderMonthly();

    // recompensas
    const tot = Metrics.totals();
    $('#rewardList').innerHTML = Store.state.rewards.slice().sort((a, b) => a.pts - b.pts).map(r => {
      const st = Metrics.rewardStatus(r, tot, wAvg);
      const cond = st.state === 'claimed' ? `canjeada ${new Date(r.claimed).toLocaleDateString('es-PE')}` :
        `${r.pts} pts ${st.okPts ? '✓' : `(faltan ${st.missingPts})`} · semana ≥ ${pct(r.minWeek)} ${st.okWeek ? '✓' : `(vas ${pct(wAvg)})`}`;
      return `<li class="${st.state}"><span>${esc(r.label)}<br><span class="small muted">${cond}</span></span><span class="acts">
        ${st.state === 'ready' ? `<button class="xs gold" data-claim="${r.id}">CANJEAR</button>` : st.state === 'claimed' ? `<button class="xs" data-unclaim="${r.id}">REACTIVAR</button>` : '<span class="badge cyan">BLOQUEADA</span>'}
        <button class="xs" data-edit-reward="${r.id}">✎</button></span></li>`;
    }).join('');
  }

  // Tendencia de 30 días (índice y planificación, en %) y mapa del mes
  function renderTrend(data) {
    const W = 640, H = 230, L = 36, R = 10, T = 12, B = 26, cw = W - L - R, ch = H - T - B;
    const X = i => L + (cw * i) / (data.length - 1), Y = v => T + ch * (1 - v);
    let g = `<defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF8A1F"/><stop offset="1" stop-color="#E8257F"/></linearGradient>
      <linearGradient id="ta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8A1F" stop-opacity=".35"/><stop offset="1" stop-color="#E8257F" stop-opacity="0"/></linearGradient></defs>`;
    for (const v of [0, 0.5, 1]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
    g += `<line class="goal" x1="${L}" x2="${W - R}" y1="${Y(Metrics.STREAK_GOAL)}" y2="${Y(Metrics.STREAK_GOAL)}"/>`;
    data.forEach((x, i) => { if (i % 5 === 0 || i === data.length - 1) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${parseYmd(x.date).getDate()} ${MONTHS[parseYmd(x.date).getMonth()].slice(0, 3)}</text>`; });
    const pts = data.map((x, i) => ({ i, x })).filter(o => o.x.total);
    if (!pts.length) { $('#trendChart').innerHTML = g + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Aún no hay días con actividades.</text>`; }
    else {
      const p1 = pts.map(o => `${X(o.i).toFixed(1)},${Y(o.x.index).toFixed(1)}`);
      const p2 = pts.map(o => `${X(o.i).toFixed(1)},${Y(Metrics.planning(o.x.date).pct).toFixed(1)}`);
      if (pts.length > 1) g += `<polygon fill="url(#ta)" points="${X(pts[0].i).toFixed(1)},${Y(0)} ${p1.join(' ')} ${X(pts[pts.length - 1].i).toFixed(1)},${Y(0)}"/><polyline class="l2" points="${p2.join(' ')}"/><polyline class="l1" points="${p1.join(' ')}"/>`;
      g += pts.map(o => `<circle class="dot" cx="${X(o.i).toFixed(1)}" cy="${Y(o.x.index).toFixed(1)}" r="${o.i === data.length - 1 ? 4.5 : 2.6}"><title>${fmtDay(o.x.date)}: índice ${pct(o.x.index)} · planificación ${pct(Metrics.planning(o.x.date).pct)}</title></circle>`).join('');
      $('#trendChart').innerHTML = g;
    }
    const n = new Date(), y = n.getFullYear(), m = n.getMonth(), nd = new Date(y, m + 1, 0).getDate(), off = (new Date(y, m, 1).getDay() + 6) % 7;
    $('#heatTitle').textContent = `MAPA DE ${MONTHS[m].toUpperCase()}`;
    let h = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="hd">${d}</div>`).join('') + '<div class="hd"></div>'.repeat(off);
    for (let i = 1; i <= nd; i++) {
      const d = `${y}-${pad(m + 1)}-${pad(i)}`, md = d <= today() ? Metrics.day(d) : null, has = md && md.total;
      h += `<div class="${d === today() ? 'today' : ''}" title="${has ? pct(md.index) : d > today() ? '' : 'Sin actividades'}" style="${has ? `background:rgba(255,138,31,${(0.12 + 0.78 * md.index).toFixed(2)});border-color:transparent` : ''}">${i}</div>`;
    }
    $('#heatMap').innerHTML = h;
  }

  function renderMonthly() {
    const r = Monthly.report(ui.month), st = r.s;
    const cur = ui.month === Monthly.monthKey(new Date());
    $('#monthLabel').textContent = Monthly.label(ui.month).toUpperCase() + (cur ? ' · EN CURSO' : '');
    if (r.empty) { $('#monthReport').innerHTML = '<div class="muted">Sin actividades registradas en este mes.</div>'; return; }
    const bm = (k, l, gold) => `<div class="bm"><span class="k ${gold ? 'gold' : ''}">${k}</span><span class="l">${l}</span></div>`;
    const prev = r.prev.n ? ` <span class="small muted">(mes anterior ${r.prev.grade.toFixed(1)})</span>` : '';
    const list = (t, arr, cls) => `<div class="mcol"><h2 class="mt">${t}</h2><ul class="tips">${arr.length ? arr.map(x => `<li class="${cls}">${esc(x)}</li>`).join('') : '<li>—</li>'}</ul></div>`;
    $('#monthReport').innerHTML = `
      <div class="big-metrics">
        ${bm(`${st.grade.toFixed(1)}/10`, 'Calificación del mes' + prev, true)}
        ${bm(pct(st.index, 1), 'Índice promedio')}
        ${bm(pct(st.punct, 1), 'Puntualidad')}
        ${bm(`${st.planScore.toFixed(1)}/10`, 'Planificación promedio', true)}
        ${bm(`${st.overGoal}/${st.n}`, 'Días sobre la meta')}
        ${bm(`${st.doneT}/${st.totalT}`, 'Actividades hechas')}
        ${bm(`${st.ownH.toFixed(1)} h`, 'Trabajo propio')}
        ${bm(`${st.night} · ${st.morning} · ${st.late}`, 'Plan: noche · mañana · tarde')}
      </div>
      <div class="mgrid">${list('FORTALEZAS', r.good, '')}${list('POR MEJORAR', r.improve, 'media')}${list('RECOMENDACIONES', r.recs, 'alta')}</div>`;
  }
  $('#monthVoice').onclick = () => Voice.speak(Monthly.voiceText(Monthly.report(ui.month))) || toast('Voz no disponible.');

  // ============ AJUSTES ============
  function renderAjustes() {
    const c = Cloud;
    const msg = {
      local: 'Modo local: los datos están solo en este equipo. Para sincronizar celular, tablet y laptop configura Firebase (GUIA_INSTALACION.md, paso 2).',
      connecting: 'Conectando con la nube…',
      signedout: 'Nube configurada. Inicia sesión con tu Gmail personal para sincronizar.',
      online: `Sincronizado como ${c.user?.email || ''}${c.lastSync ? ' · última sincronización ' + c.lastSync.toLocaleTimeString('es-PE') : ''}. Push en este equipo: ${c.pushActive ? 'activo' : 'inactivo'}.`,
      error: c.error,
    }[c.status];
    $('#cloudBox').textContent = msg;
    $('#loginBtn').hidden = !(c.status === 'signedout' || (c.status === 'error' && c.configured && !c.user));
    $('#logoutBtn').hidden = c.status !== 'online';

    const st = Notify.status();
    $('#sysStatus').textContent = {
      granted: 'Notificaciones permitidas en este equipo.',
      denied: 'Notificaciones bloqueadas: actívalas en la configuración del navegador para este sitio.',
      default: 'Pulsa “Activar notificaciones”.',
      unsupported: 'Este navegador no admite notificaciones.',
    }[st] + ` Voz: ${Voice.voiceName}.` + (location.protocol === 'file:' ? ' Abierto como archivo: usa iniciar.bat.' : '');
    $('#notifBtn').hidden = st === 'granted' && (!Cloud.configured || Cloud.pushActive);
    $('#notifBtn').textContent = st === 'granted' ? 'ACTIVAR PUSH EN ESTE EQUIPO' : 'ACTIVAR NOTIFICACIONES';
    $('#soundBtn').textContent = `SONIDO: ${Store.state.settings.sound ? 'ON' : 'OFF'}`;
    $('#voiceBtn').textContent = `VOZ: ${Store.state.settings.voice ? 'ON' : 'OFF'}`;
    const f = $('#settingsForm');
    if (!f.contains(document.activeElement)) for (const k of ['name', 'remindEarly', 'remindBefore', 'briefingTime', 'planTime', 'morningPlanUntil', 'dailyGoalHours']) f.elements[k].value = Store.state.settings[k];
    const DN = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    $('#mealList').innerHTML = Store.state.meals.slice().sort((a, b) => toMin(a.start) - toMin(b.start)).map(m => `<li><div class="grow">${esc(m.label)}<div class="sub">${m.start}–${m.end} · ${(m.days || []).length === 7 ? 'todos los días' : (m.days || []).map(d => DN[d]).join(' ')}</div></div><button class="xs" data-edit-meal="${m.id}">✎</button></li>`).join('') || '<li class="muted">Sin comidas registradas.</li>';
  }

  $('#settingsForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements, s = Store.state.settings;
    s.name = f.name.value.trim() || 'Frank Ramos';
    s.remindEarly = Math.max(0, Math.min(180, Number(f.remindEarly.value) || 0));
    s.remindBefore = Math.max(0, Math.min(60, Number(f.remindBefore.value) || 0));
    s.briefingTime = f.briefingTime.value || '05:00';
    s.planTime = f.planTime.value || '21:30';
    s.morningPlanUntil = f.morningPlanUntil.value || '09:00';
    s.dailyGoalHours = Math.max(1, Math.min(16, Number(f.dailyGoalHours.value) || 6));
    Store.save(); toast('Ajustes guardados.');
  });
  $('#notifBtn').onclick = async () => {
    const r = await Notify.request();
    if (r === 'granted' && Cloud.status === 'online') {
      try { toast((await Cloud.enablePush()) ? 'Push activado en este equipo.' : 'Notificaciones locales activas (push requiere la clave VAPID).'); }
      catch (e) { toast('No se pudo activar push: ' + e.message); }
    } else toast(r === 'granted' ? 'Notificaciones activadas.' : 'No se concedió el permiso.');
    renderAjustes();
  };
  $('#testNotifBtn').onclick = () => Notify.send('J.A.R.V.I.S.', 'Prueba de aviso: sistemas en línea.', 'test');
  $('#testVoiceBtn').onclick = () => Voice.speak(`Sistemas en línea, ${Store.state.settings.name}. Esta es mi voz.`) || toast('Voz no disponible.');
  $('#soundBtn').onclick = () => { Store.state.settings.sound = !Store.state.settings.sound; Store.save(); };
  $('#voiceBtn').onclick = () => { Store.state.settings.voice = !Store.state.settings.voice; Store.save(); };
  $('#loginBtn').onclick = () => Cloud.login();
  $('#logoutBtn').onclick = () => Cloud.logout();
  $('#exportBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Store.exportJSON()], { type: 'application/json' }));
    a.download = `jarvis-ramos-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#importFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { Store.importJSON(await file.text()); toast('Respaldo importado.'); } catch (err) { toast('No se pudo importar: ' + err.message); }
    e.target.value = '';
  };

  // ============ diálogo de tarea ============
  const dlg = $('#taskDialog'), form = $('#taskForm');
  let editing = null, editingDate = null;

  function fillSelects(subjectId, topicId, pendingId) {
    const subs = Store.state.subjects;
    form.elements.subjectId.innerHTML = '<option value="">—</option>' + subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    form.elements.subjectId.value = subjectId || '';
    const tps = Store.state.topics.filter(t => t.subjectId === form.elements.subjectId.value);
    form.elements.topicId.innerHTML = '<option value="">—</option>' + tps.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    form.elements.topicId.value = topicId || '';
    const pend = Store.allPendings({ includeClosed: !!pendingId });
    form.elements.pendingId.innerHTML = '<option value="">—</option>' + pend.map(p => `<option value="${esc(p.id)}">${esc(p.title)} (${fmtDue(p.due)})</option>`).join('');
    form.elements.pendingId.value = pendingId || '';
  }
  form.elements.subjectId.addEventListener('change', () => fillSelects(form.elements.subjectId.value, '', form.elements.pendingId.value));

  function suggestSlot(dateStr) {
    const busy = [...Store.tasksFor(dateStr), ...Store.mealsFor(dateStr)].map(x => span(x.start, x.end)).sort((a, b) => a[0] - b[0]);
    let s = dateStr === today() ? Math.ceil(nowMin() / 15) * 15 : 8 * 60;
    for (const [a, b] of busy) if (s < b && s + 60 > a) s = b;
    s = Math.min(s, 22 * 60);
    return [fromMin(s), fromMin(Math.min(s + 60, 23 * 60 + 59))];
  }

  function openTask(task, dateStr, preset = {}) {
    editing = task ? task.id : null;
    editingDate = task ? task.date : dateStr;
    $('#dlgTitle').textContent = task ? 'EDITAR ACTIVIDAD' : `NUEVA ACTIVIDAD · ${fmtDay(dateStr)}`;
    $('#delBtn').hidden = !task;
    form.reset();
    const src = task || preset;
    for (const k of ['title', 'start', 'end', 'category', 'priority', 'rec', 'notes']) if (src[k] != null) form.elements[k].value = src[k];
    if (!task) { const [s, e] = suggestSlot(dateStr); if (!preset.start) { form.elements.start.value = s; form.elements.end.value = e; } }
    form.elements.closesPending.checked = !!src.closesPending;
    fillSelects(src.subjectId, src.topicId, src.pendingId);
    dlg.showModal();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = form.elements;
    if (f.start.value === f.end.value) { toast('La hora de fin debe ser distinta a la de inicio.'); return; }
    Store.upsertTask({
      ...(editing ? { id: editing } : {}),
      title: f.title.value.trim(), start: f.start.value, end: f.end.value,
      category: f.category.value, priority: Number(f.priority.value), rec: f.rec.value, notes: f.notes.value.trim(),
      subjectId: f.subjectId.value, topicId: f.topicId.value, pendingId: f.pendingId.value, closesPending: f.closesPending.checked,
      date: editingDate,
    });
    dlg.close(); toast(editing ? 'Actividad actualizada.' : 'Actividad agregada.');
  });
  $('#delBtn').onclick = () => {
    const t = Store.state.tasks.find(x => x.id === editing); if (!t) return;
    if (!confirm(t.rec && t.rec !== 'none' ? '¿Eliminar esta actividad repetitiva de todos los días?' : '¿Eliminar esta actividad?')) return;
    Store.deleteTask(editing); dlg.close(); toast('Actividad eliminada.');
  };

  // ============ diálogo genérico ============
  const gdlg = $('#formDialog'), gform = $('#genForm');
  let gSave = null, gDelete = null;
  function openForm({ title, fields, onSave, onDelete }) {
    $('#genTitle').textContent = title;
    $('#genFields').innerHTML = fields.map(f => {
      const v = f.value ?? '';
      if (f.type === 'select') return `<label>${f.label}<select name="${f.name}">${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      if (f.type === 'days') return `<label>${f.label}<div class="days-pick">${['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d, i) => `<label><input type="checkbox" name="${f.name}" value="${i}" ${(v || []).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></label>`;
      if (f.type === 'textarea') return `<label>${f.label}<textarea name="${f.name}" rows="2">${esc(v)}</textarea></label>`;
      return `<label>${f.label}<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.attrs || ''}></label>`;
    }).join('');
    gSave = onSave; gDelete = onDelete;
    $('#genDel').hidden = !onDelete;
    gdlg.showModal();
  }
  gform.addEventListener('submit', e => {
    e.preventDefault();
    const out = {};
    for (const el of gform.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') { (out[el.name] ||= []); if (el.checked) out[el.name].push(Number(el.value)); }
      else out[el.name] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    }
    if (gSave?.(out) !== false) gdlg.close();
  });
  $('#genDel').onclick = () => { if (gDelete && confirm('¿Eliminar?')) { gDelete(); gdlg.close(); } };
  $$('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());

  const subjectOpts = () => [{ value: '', label: '—' }, ...Store.state.subjects.map(s => ({ value: s.id, label: s.name }))];

  function editSubject(s) {
    openForm({
      title: s ? 'EDITAR ASIGNATURA' : 'NUEVA ASIGNATURA',
      fields: [
        { name: 'name', label: 'Nombre', value: s?.name, required: true },
        { name: 'teacher', label: 'Docente', value: s?.teacher },
        { name: 'credits', label: 'Créditos', type: 'number', value: s?.credits ?? 3, attrs: 'min="0" max="10"' },
        { name: 'target', label: 'Nota meta (0–20)', type: 'number', value: s?.target ?? 14, attrs: 'min="10.5" max="20" step="0.1"' },
        ...[0, 1, 2].map(i => ({ name: 'u' + i, label: `Nota Unidad ${i + 1} (vacío si aún no hay)`, type: 'number', value: s?.units?.[i]?.grade ?? '', attrs: 'min="0" max="20" step="0.1"' })),
        { name: 'color', label: 'Color', type: 'select', value: s?.color || COLORS[Store.state.subjects.length % COLORS.length], options: COLORS.map((c, i) => ({ value: c, label: ['Cian', 'Dorado', 'Verde', 'Naranja', 'Violeta', 'Rosa', 'Celeste'][i] })) },
      ],
      onSave: v => {
        const units = [0, 1, 2].map(i => ({ id: 'u' + (i + 1), name: `Unidad ${i + 1}`, weight: s?.units?.[i]?.weight || 1, grade: v['u' + i] === '' || isNaN(v['u' + i]) ? null : Math.min(20, Math.max(0, Number(v['u' + i]))) }));
        const { u0, u1, u2, ...rest } = v;
        Store.upsert('subjects', { ...(s || { exams: [] }), ...rest, units });
        toast('Asignatura guardada.');
      },
      onDelete: s && (() => Store.remove('subjects', s.id)),
    });
  }
  function editTopic(t, subjectId) {
    openForm({
      title: t ? 'EDITAR TEMA' : 'NUEVO TEMA',
      fields: [
        { name: 'name', label: 'Tema', value: t?.name, required: true },
        { name: 'confidence', label: 'Confianza actual', type: 'select', value: t?.confidence || 1, options: [1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n} · ${['No lo entiendo', 'Lo entiendo poco', 'Regular', 'Bien', 'Lo domino'][n - 1]}` })) },
        { name: 'studied', label: t ? 'Registrar repaso ahora' : '¿Ya lo estudiaste?', type: 'select', value: 'no', options: [{ value: 'no', label: 'No' }, { value: 'si', label: 'Sí, hoy' }] },
      ],
      onSave: v => {
        const base = t || { subjectId, reviews: [] };
        const reviews = [...(base.reviews || [])]; if (v.studied === 'si') reviews.push(new Date().toISOString());
        Store.upsert('topics', { ...base, name: v.name, confidence: Number(v.confidence), reviews });
      },
      onDelete: t && (() => Store.remove('topics', t.id)),
    });
  }
  function editExam(subject, exam) {
    openForm({
      title: exam ? 'EDITAR EXAMEN' : `EXAMEN · ${subject.name}`,
      fields: [
        { name: 'name', label: 'Nombre', value: exam?.name || 'Examen parcial', required: true },
        { name: 'date', label: 'Fecha', type: 'date', value: exam?.date, required: true },
      ],
      onSave: v => {
        const exams = (subject.exams || []).filter(e => e.id !== exam?.id);
        exams.push({ id: exam?.id || Store.uid(), ...v });
        Store.upsert('subjects', { ...subject, exams });
      },
      onDelete: exam && (() => Store.upsert('subjects', { ...subject, exams: subject.exams.filter(e => e.id !== exam.id) })),
    });
  }
  function editPending(p, preset = {}) {
    const src = p || preset;
    openForm({
      title: p ? 'EDITAR ENTREGA' : 'NUEVA ENTREGA',
      fields: [
        { name: 'title', label: 'Entrega / actividad del curso', value: src.title, required: true },
        { name: 'subjectId', label: 'Asignatura', type: 'select', value: src.subjectId, options: subjectOpts() },
        { name: 'due', label: 'Fecha de entrega', type: 'date', value: src.due?.slice(0, 10), required: true },
        { name: 'link', label: 'Enlace (opcional)', type: 'url', value: src.link },
      ],
      onSave: v => { Store.upsert('pendings', { ...(p || { source: preset.source || 'manual', fromEmail: preset.fromEmail }), ...v }); if (preset.fromEmail) Store.setPendingState(preset.fromEmail, 'dismissed'); toast('Entrega guardada.'); },
      onDelete: p && (() => Store.remove('pendings', p.id)),
    });
  }
  function editMeal(m) {
    openForm({
      title: m ? 'EDITAR COMIDA' : 'NUEVA COMIDA',
      fields: [
        { name: 'label', label: 'Nombre', value: m?.label || 'Refrigerio', required: true },
        { name: 'start', label: 'Inicio', type: 'time', value: m?.start || '10:30', required: true },
        { name: 'end', label: 'Fin', type: 'time', value: m?.end || '10:45', required: true },
        { name: 'days', label: 'Días', type: 'days', value: m?.days || [0, 1, 2, 3, 4, 5, 6] },
      ],
      onSave: v => { if (!v.days.length) { toast('Elige al menos un día.'); return false; } Store.upsert('meals', { ...(m || {}), ...v }); },
      onDelete: m && (() => Store.remove('meals', m.id)),
    });
  }
  function editReward(r) {
    openForm({
      title: r ? 'EDITAR RECOMPENSA' : 'NUEVA RECOMPENSA',
      fields: [
        { name: 'label', label: 'Recompensa', value: r?.label, required: true },
        { name: 'pts', label: 'Puntos necesarios', type: 'number', value: r?.pts || 300, attrs: 'min="10" step="10"' },
        { name: 'minWeek', label: 'Promedio semanal mínimo (%)', type: 'number', value: Math.round((r?.minWeek ?? 0.7) * 100), attrs: 'min="0" max="100"' },
      ],
      onSave: v => Store.upsert('rewards', { ...(r || { claimed: null }), label: v.label, pts: Math.max(10, v.pts), minWeek: Math.min(1, Math.max(0, v.minWeek / 100)) }),
      onDelete: r && (() => Store.remove('rewards', r.id)),
    });
  }

  $('#addSubject').onclick = () => editSubject(null);
  $('#addPending').onclick = () => editPending(null);
  $('#addMeal').onclick = () => editMeal(null);
  $('#addReward').onclick = () => editReward(null);

  // ============ clics delegados ============
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-done],[data-edit],[data-add-task],[data-shift],[data-pshift],[data-gshift],[data-mshift],[data-review],[data-stars],[data-add-topic],[data-edit-topic],[data-add-exam],[data-edit-exam],[data-edit-subject],[data-schedule],[data-pdone],[data-pdismiss],[data-pedit],[data-email-add],[data-claim],[data-unclaim],[data-edit-reward],[data-edit-meal]');
    if (!el) return;
    const d = el.dataset;
    if (d.done) {
      e.stopPropagation();
      const nowDone = Store.toggleDone(d.done);
      if (nowDone) {
        Notify.beep();
        if (d.done.endsWith('|' + today())) { const c = currentAndNext(); Notify.announceNext(c.live || c.next); }
        else toast('Actividad marcada como hecha.');
      }
    }
    else if (d.edit) { const t = Store.state.tasks.find(x => x.id === d.edit); if (t) openTask(t); }
    else if (d.addTask !== undefined) openTask(null, d.addTask === 'plan' ? ui.planDate : ui.hoyDate);
    else if (d.shift !== undefined) { ui.hoyDate = d.shift === '0' ? today() : addDays(ui.hoyDate, Number(d.shift)); render(); }
    else if (d.pshift) { ui.planDate = addDays(ui.planDate, Number(d.pshift)); render(); }
    else if (d.gshift) { ui.progDate = addDays(ui.progDate, Number(d.gshift)); render(); }
    else if (d.mshift) { ui.month = Monthly.shiftMonth(ui.month, Number(d.mshift)); render(); }
    else if (d.review) { Study.logReview(d.review); toast('Repaso registrado.'); }
    else if (d.stars) {
      const t = Store.state.topics.find(x => x.id === d.stars); if (!t) return;
      const rect = el.getBoundingClientRect();
      const n = Math.min(5, Math.max(1, Math.ceil(((e.clientX - rect.left) / rect.width) * 5)));
      Store.upsert('topics', { ...t, confidence: n });
    }
    else if (d.addTopic) editTopic(null, d.addTopic);
    else if (d.editTopic) editTopic(Store.state.topics.find(x => x.id === d.editTopic));
    else if (d.addExam) editExam(Store.state.subjects.find(s => s.id === d.addExam));
    else if (d.editExam) { const [sid, eid] = d.editExam.split('|'); const s = Store.state.subjects.find(x => x.id === sid); editExam(s, s.exams.find(x => x.id === eid)); }
    else if (d.editSubject) editSubject(Store.state.subjects.find(s => s.id === d.editSubject));
    else if (d.schedule) {
      const p = Store.allPendings({ includeClosed: true }).find(x => x.id === d.schedule); if (!p) return;
      const dueDay = p.due ? p.due.slice(0, 10) : ui.planDate;
      const day = ui.view === 'plan' ? ui.planDate : (dueDay > today() ? addDays(dueDay, -1) < today() ? today() : addDays(dueDay, -1) : today());
      openTask(null, day, { title: `Avanzar: ${p.title}`, category: 'Universidad', priority: 3, subjectId: p.subjectId, pendingId: p.id, closesPending: false });
    }
    else if (d.pdone) { Store.setPendingState(d.pdone, 'done'); toast('Entrega marcada como hecha.'); }
    else if (d.pdismiss) Store.setPendingState(d.pdismiss, 'dismissed');
    else if (d.pedit) editPending(Store.state.pendings.find(p => p.id === d.pedit));
    else if (d.emailAdd) { const m = (Store.server.emails || []).find(x => x.id === d.emailAdd); if (m) editPending(null, { title: m.subject, due: m.detectedDue, link: m.link, source: 'gmail', fromEmail: m.id }); }
    else if (d.claim) { const r = Store.state.rewards.find(x => x.id === d.claim); Store.upsert('rewards', { ...r, claimed: new Date().toISOString() }); toast(`¡Disfruta tu recompensa: ${r.label}!`); }
    else if (d.unclaim) { const r = Store.state.rewards.find(x => x.id === d.unclaim); Store.upsert('rewards', { ...r, claimed: null }); }
    else if (d.editReward) editReward(Store.state.rewards.find(x => x.id === d.editReward));
    else if (d.editMeal) editMeal(Store.state.meals.find(x => x.id === d.editMeal));
  });

  // ============ pregúntale a Jarvis ============
  const askLog = [];
  function ask(q) {
    q = String(q || '').trim(); if (!q) return;
    let a;
    try { a = Assistant.answer(q); } catch (e) { console.error(e); a = 'Tuve un problema al revisar sus datos. Inténtelo de nuevo.'; }
    askLog.push({ q, a }); if (askLog.length > 3) askLog.shift();
    $('#askLog').innerHTML = askLog.map(x => `<div class="q">${esc(x.q)}</div><div class="a">${esc(x.a)}</div>`).join('');
    const orb = $('#briefBtn');
    if (Voice.available() && Store.state.settings.voice) {
      orb.classList.add('talking'); $('#briefState').textContent = 'Respondiendo… (toca el núcleo para detener)';
      Voice.speak(a, { onEnd: () => { orb.classList.remove('talking'); $('#briefState').textContent = 'Pregúnteme lo que necesite'; } });
    } else $('#briefState').textContent = 'Voz desactivada: actívela en AJUSTES → VOZ';
  }
  $('#askForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#askInput'); const q = i.value; i.value = ''; ask(q); });
  $('#askChips').innerHTML = ['¿Qué me toca ahora?', '¿Cómo voy hoy?', '¿Cómo voy esta semana?', '¿Qué tengo mañana?', '¿Qué entregas tengo?', 'Aconséjeme'].map(c => `<button type="button" data-ask="${esc(c)}">${c}</button>`).join('');
  $('#askChips').addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) ask(b.dataset.ask); });
  const micBtn = $('#askMic');
  micBtn.hidden = !Assistant.canListen();
  micBtn.onclick = () => {
    Voice.stop();
    Assistant.listen({
      onText: t => ask(t),
      onState: (st, err) => {
        micBtn.classList.toggle('on', st === 'listening');
        micBtn.textContent = st === 'listening' ? '● ESCUCHANDO' : '🎙 HABLAR';
        if (st === 'error') toast(err === 'not-allowed' ? 'Permita el micrófono para este sitio.' : err === 'network' ? 'El dictado necesita internet.' : 'No lo escuché. Inténtelo de nuevo.');
      },
    });
  };

  // ============ render ============
  const renderers = { inicio: renderInicio, hoy: renderHoy, plan: renderPlan, cursos: renderCursos, progreso: renderProgreso, ajustes: renderAjustes };
  function render() {
    try { renderers[ui.view]?.(); } catch (e) { console.error('Error al dibujar', e); }
    const dot = $('#cloudDot');
    dot.className = 'brand-dot ' + ({ online: '', local: 'off', error: 'warn', signedout: 'warn', connecting: 'warn' }[Cloud.status] ?? '');
    $('#brandSub').textContent = { online: 'SINCRONIZADO EN LA NUBE', local: 'MODO LOCAL · RAMOS', error: 'NUBE CON PROBLEMAS', signedout: 'INICIA SESIÓN', connecting: 'CONECTANDO…' }[Cloud.status] || 'RAMOS';
  }
  let rq = 0;
  const scheduleRender = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(render); };
  Store.onChange(scheduleRender);
  Cloud.onChange(scheduleRender);

  // ============ arranque ============
  async function boot() {
    renderClock();
    show(ui.view);
    const lines = ['INICIALIZANDO J.A.R.V.I.S.', 'SINCRONIZANDO DATOS', 'SISTEMAS EN LÍNEA'];
    let i = 0;
    const iv = setInterval(() => { if (++i < lines.length) $('#bootText').textContent = lines[i]; }, 350);
    setTimeout(() => { clearInterval(iv); $('#boot').classList.add('hide'); }, 1100);

    await Notify.init();
    Cloud.init();
    News.load().then(scheduleRender);

    // En la franja del informe matutino, abre INICIO e invita a escucharlo
    const bt = toMin(Store.state.settings.briefingTime), n = nowMin();
    if (n >= bt && n < bt + 240 && !Store.state.briefed[today()]) {
      show('inicio');
      $('#briefState').innerHTML = '<b style="color:var(--gold)">Informe del día listo · toca el núcleo para escucharlo</b>';
    }

    setInterval(renderClock, 1000);
    setInterval(() => { Notify.tick(); if (ui.view === 'hoy') { renderNow(); renderReactor(); } }, 20000);
    Notify.tick();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { Notify.tick(); News.load().then(scheduleRender); render(); } });
  }

  window.App = { toast, render, show, ask };
  boot();
})();
