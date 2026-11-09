/* Avisos locales (mientras la app está abierta o en segundo plano).
   Con la nube activa, los mismos avisos también llegan como push con la app cerrada (backend/recordatorios.mjs).
   Ambos comparten las claves de "ya avisado", así no se duplican. */
(function () {
  const supported = 'Notification' in window;
  let swReg = null, audioCtx = null;

  async function init() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      try { swReg = await navigator.serviceWorker.register('sw.js'); }
      catch (e) { console.warn('Service worker no registrado', e); }
    }
    return swReg;
  }

  const status = () => supported ? Notification.permission : 'unsupported';
  async function request() {
    if (!supported) return 'unsupported';
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  }

  function beep() {
    if (!Store.state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.2);
      });
    } catch { /* sin audio */ }
  }

  async function send(title, body, tag) {
    beep();
    window.App?.toast(`${title} — ${body}`);
    // Con la app en pantalla basta el aviso interno; fuera de pantalla (o en la prueba) va la notificación del sistema
    if (status() !== 'granted') return false;
    // si la nube envía push a este equipo, el servidor se encarga de las notificaciones del sistema
    if (window.Cloud?.pushActive && !String(tag).startsWith('test')) return false;
    if (document.visibilityState === 'visible' && !String(tag).startsWith('test')) return false;
    const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [120, 60, 120], renotify: true };
    try {
      if (swReg) { await swReg.showNotification(title, opts); return true; }
      new Notification(title, opts); return true;
    } catch (e) { console.warn('No se pudo mostrar la notificación', e); return false; }
  }

  /* Reglas (las mismas que usa el servidor):
     - Tarea: un aviso desde X min antes del inicio hasta su fin (si no está hecha) y otro al terminar el bloque.
     - Comida: un aviso al llegar la hora.
     - Planificación nocturna y briefing matutino: una vez por día, a partir de su hora. */
  function tick() {
    const { ymd, toMin, span, addDays } = Store.util;
    const now = new Date(), today = ymd(now);
    const n = now.getHours() * 60 + now.getMinutes();
    const s = Store.state.settings;
    const before = Number(s.remindBefore) || 5;
    const fire = (k, title, body) => { if (Store.wasNotified(k)) return; Store.markNotified(k); send(title, body, k); };

    for (const t of Store.tasksFor(today)) {
      if (t.doneAt) continue;
      const [st, en] = span(t.start, t.end);
      if (n >= st - before && n < en) {
        fire(`start|${t.key}`, n < st ? `En ${st - n} min: ${t.title}` : `Ahora: ${t.title}`, `Bloque ${t.start}–${t.end}. Prioridad ${['', 'baja', 'media', 'alta'][t.priority]}.`);
      } else if (n >= en && n < en + 60) {
        fire(`end|${t.key}`, `¿Completaste "${t.title}"?`, 'Márcala como hecha para registrar tu avance.');
      }
    }
    for (const m of Store.mealsFor(today)) {
      const [st, en] = span(m.start, m.end);
      if (n >= st && n < en) fire(m.key, `Hora de: ${m.label}`, `${m.start}–${m.end}. Pausa y aliméntate bien.`);
    }
    const pt = toMin(s.planTime);
    if (n >= pt && n < pt + 120) {
      const tm = Store.tasksFor(addDays(today, 1));
      fire(`plan|${today}`, 'Planifica tu día de mañana', tm.length ? `Ya listaste ${tm.length} actividades. Revísalas y confirma el plan.` : 'Aún no listaste actividades para mañana.');
    }
    monthlyTick();
    const bt = toMin(s.briefingTime);
    if (n >= bt && n < bt + 180) {
      const tt = Store.tasksFor(today);
      fire(`brief|${today}`, 'Buenos días. Informe listo', tt.length ? `${tt.length} actividades hoy; la primera a las ${tt[0].start}. Toca para escuchar el informe.` : 'Abre la app para escuchar las noticias y planificar tu día.');
    }
  }

  // Día 1 de cada mes, desde las 08:00: informe del mes anterior
  function monthlyTick() {
    const now = new Date();
    if (now.getDate() !== 1 || now.getHours() < 8 || !window.Monthly) return;
    const key = Monthly.shiftMonth(Monthly.monthKey(now), -1);
    const k = `month|${key}`;
    if (Store.wasNotified(k)) return;
    const r = Monthly.report(key);
    if (r.empty) return;
    Store.markNotified(k);
    send(`${r.title}: ${r.s.grade.toFixed(1)}/10`, `Índice ${Math.round(r.s.index * 100)} % · ${r.improve[0] || 'Buen mes.'} Toca para ver recomendaciones.`, k);
  }

  function announceNext(task) {
    if (!task) { send('Plan del día completo', 'No quedan actividades pendientes. Buen trabajo.', 'next'); return; }
    send(`Siguiente: ${task.title}`, `A las ${task.start} · ${task.category}`, 'next');
  }

  window.Notify = { init, status, request, send, tick, announceNext, beep, get registration() { return swReg; } };
})();
