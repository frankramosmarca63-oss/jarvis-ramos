/* Seguimiento de estudio con curva del olvido (Ebbinghaus) y repaso espaciado.

   Para cada tema:
   - n   = número de repasos registrados
   - S   = estabilidad de la memoria (días) = 2·2^(n−1) · (0.6 + 0.2·confianza)
           cada repaso duplica cuánto dura lo aprendido; la confianza (1–5) lo ajusta
   - R   = retención estimada hoy = e^(−días desde el último repaso / S)
   - Dominio = (confianza / 5) · R
   - Próximo repaso: cuando R baja a 70 % → t = −S·ln(0.7)

   Preparación de una asignatura para el examen = promedio del dominio de sus temas. */
(function () {
  const { ymd, parseYmd } = Store.util;
  const R_MIN = 0.7;
  const DAY = 864e5;

  function stability(tp) {
    const n = (tp.reviews || []).length;
    if (!n) return 0;
    return 2 * Math.pow(2, n - 1) * (0.6 + 0.2 * (Number(tp.confidence) || 1));
  }

  function topicState(tp, now = new Date()) {
    const reviews = (tp.reviews || []).slice().sort();
    const n = reviews.length;
    const conf = Number(tp.confidence) || 1;
    if (!n) return { n, retention: 0, mastery: 0, nextReview: ymd(now), dueNow: true, daysSince: null, last: null };
    const last = new Date(reviews[n - 1]);
    const days = Math.max(0, (now - last) / DAY);
    const S = stability(tp);
    const retention = Math.exp(-days / S);
    const next = new Date(last.getTime() + (-S * Math.log(R_MIN)) * DAY);
    return { n, retention, mastery: (conf / 5) * retention, nextReview: ymd(next), dueNow: retention < R_MIN, daysSince: days, last };
  }

  function nextExam(subject, from = ymd(new Date())) {
    return (subject.exams || []).filter(e => e.date >= from).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
  }
  const daysUntil = dateStr => Math.round((parseYmd(dateStr) - parseYmd(ymd(new Date()))) / DAY);

  function subjectState(subject) {
    const topics = Store.state.topics.filter(t => t.subjectId === subject.id).map(t => ({ ...t, st: topicState(t) }));
    const readiness = topics.length ? topics.reduce((a, t) => a + t.st.mastery, 0) / topics.length : 0;
    const coverage = topics.length ? topics.filter(t => t.st.n > 0).length / topics.length : 0;
    const exam = nextExam(subject);
    return { topics, readiness, coverage, exam, examIn: exam ? daysUntil(exam.date) : null, due: topics.filter(t => t.st.dueNow) };
  }

  // Temas para repasar hoy: primero los de asignaturas con examen cercano y menor retención
  function reviewQueue(limit = 8) {
    const out = [];
    for (const s of Store.state.subjects) {
      const ss = subjectState(s);
      for (const t of ss.due) {
        const urgency = (ss.examIn != null && ss.examIn <= 21 ? 2 - ss.examIn / 21 : 0) + (1 - t.st.retention);
        out.push({ subject: s, topic: t, urgency, examIn: ss.examIn });
      }
    }
    return out.sort((a, b) => b.urgency - a.urgency).slice(0, limit);
  }

  function logReview(topicId) {
    const tp = Store.state.topics.find(t => t.id === topicId);
    if (!tp) return;
    tp.reviews = [...(tp.reviews || []), new Date().toISOString()];
    Store.save();
  }

  /* Notas (escala vigesimal 0–20, aprobatoria 10.5)
     - Promedio actual = Σ(nota·peso) / Σ(peso) de las unidades con nota
     - Nota necesaria en las unidades que faltan para llegar a la meta M:
         x = (M·Σpeso_total − Σ(nota·peso)_rendidas) / Σpeso_faltante
     - Promedio ponderado del semestre = Σ(promedio·créditos) / Σcréditos */
  const PASS = 10.5;
  function grades(subject, target = Number(subject.target) || 14) {
    const units = subject.units || [];
    const done = units.filter(u => u.grade !== null && u.grade !== '' && !isNaN(Number(u.grade)));
    const left = units.filter(u => !done.includes(u));
    const wDone = done.reduce((a, u) => a + (Number(u.weight) || 1), 0);
    const wLeft = left.reduce((a, u) => a + (Number(u.weight) || 1), 0);
    const sum = done.reduce((a, u) => a + Number(u.grade) * (Number(u.weight) || 1), 0);
    const avg = wDone ? sum / wDone : null;
    const need = M => wLeft ? (M * (wDone + wLeft) - sum) / wLeft : null;
    return { avg, done: done.length, total: units.length, target, needPass: need(PASS), needTarget: need(target), left: left.length };
  }
  function semester() {
    const subs = Store.state.subjects.filter(s => Number(s.credits) > 0);
    let w = 0, acc = 0;
    for (const s of subs) { const g = grades(s); if (g.avg != null) { acc += g.avg * Number(s.credits); w += Number(s.credits); } }
    const credits = subs.reduce((a, s) => a + Number(s.credits), 0);
    // prioridad de estudio: créditos × distancia a 20 × (1 + urgencia de examen)
    const focus = subs.map(s => {
      const g = grades(s), ss = subjectState(s);
      const urg = ss.examIn != null && ss.examIn <= 21 ? 1 + (21 - ss.examIn) / 21 : 1;
      return { s, g, score: Number(s.credits) * (20 - (g.avg ?? 14)) / 20 * urg * (1.5 - ss.readiness * 0.5) };
    }).sort((a, b) => b.score - a.score);
    return { avg: w ? acc / w : null, credits, gradedCredits: w, focus };
  }

  window.Study = { topicState, subjectState, reviewQueue, logReview, nextExam, daysUntil, grades, semester, R_MIN, PASS };
})();
