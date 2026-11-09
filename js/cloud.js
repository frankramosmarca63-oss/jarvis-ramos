/* Nube: Firebase (inicio de sesión con Google + Firestore + notificaciones push).
   Estructura en Firestore (solo tu cuenta puede leer/escribir, ver firestore.rules):
     users/{uid}/data/main     → todo tu plan (lo escribe la app)
     users/{uid}/data/server   → Classroom, Gmail y avisos enviados (lo escribe el servidor)
     users/{uid}/data/devices  → tokens de notificación de cada equipo */
(function () {
  const cfg = self.JARVIS_CONFIG || {};
  const V = cfg.firebaseVersion || '10.12.2';
  const listeners = new Set();
  let fb = null, app, auth, db, user = null;
  let status = cfg.firebase ? 'connecting' : 'local';
  let error = '', lastSync = null, pushActive = false;
  let pushTimer = null, unsubs = [];

  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  const setStatus = (s, err = '') => { status = s; error = err; emit(); };
  const clean = obj => JSON.parse(JSON.stringify(obj));

  async function loadSdk() {
    const base = `https://www.gstatic.com/firebasejs/${V}`;
    const [a, au, fs] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`),
    ]);
    let ms = null;
    try { ms = await import(`${base}/firebase-messaging.js`); } catch { /* sin push */ }
    return { ...a, ...au, ...fs, ms };
  }

  async function init() {
    if (!cfg.firebase) { setStatus('local'); return; }
    if (location.protocol === 'file:') { setStatus('error', 'Abre la app con iniciar.bat o desde su dirección web para usar la nube.'); return; }
    try {
      fb = await loadSdk();
      app = fb.initializeApp(cfg.firebase);
      auth = fb.getAuth(app);
      db = fb.getFirestore(app);
      try { await fb.getRedirectResult(auth); } catch (e) { console.warn(e); }
      fb.onAuthStateChanged(auth, async u => {
        unsubs.forEach(f => f()); unsubs = [];
        user = u;
        if (!u) { setStatus('signedout'); return; }
        if (cfg.ownerEmail && u.email?.toLowerCase() !== cfg.ownerEmail.toLowerCase()) {
          await fb.signOut(auth);
          setStatus('error', `La cuenta ${u.email} no está autorizada. Usa ${cfg.ownerEmail}.`);
          return;
        }
        subscribe(u.uid);
        setStatus('online');
        if (Notification?.permission === 'granted') enablePush().catch(() => {});
      });
    } catch (e) {
      console.error(e);
      setStatus('error', 'No se pudo conectar con la nube (¿sin internet?). Se sigue trabajando en local.');
    }
  }

  function subscribe(uid) {
    const mainRef = fb.doc(db, 'users', uid, 'data', 'main');
    const serverRef = fb.doc(db, 'users', uid, 'data', 'server');

    unsubs.push(fb.onSnapshot(mainRef, async snap => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) { try { localStorage.setItem('jarvis-cloud-synced', '1'); } catch { } await push(); return; }       // primera vez: sube lo que hay en este equipo
      const remote = snap.data();
      // en un equipo nuevo, la nube manda (evita que los datos de ejemplo pisen tu plan real)
      let firstHere = false;
      try { firstHere = !localStorage.getItem('jarvis-cloud-synced'); localStorage.setItem('jarvis-cloud-synced', '1'); } catch { }
      if (firstHere) { Store.replace(remote); lastSync = new Date(); emit(); return; }
      const localT = Store.state.updatedAt || 0, remoteT = remote.updatedAt || 0;
      if (remoteT > localT) Store.replace(remote);
      else if (localT > remoteT) schedulePush();
      lastSync = new Date(); emit();
    }, e => setStatus('error', 'Error de sincronización: ' + e.code)));

    unsubs.push(fb.onSnapshot(serverRef, snap => { Store.setServer(snap.exists() ? snap.data() : null); },
      e => console.warn('server doc', e)));
  }

  async function push() {
    if (!user || !db) return;
    try {
      await fb.setDoc(fb.doc(db, 'users', user.uid, 'data', 'main'), clean(Store.state));
      lastSync = new Date(); emit();
    } catch (e) { console.warn(e); setStatus('error', 'No se pudo guardar en la nube: ' + (e.code || e.message)); }
  }
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }
  Store.onChange(kind => { if (kind === 'local' && status === 'online') schedulePush(); });

  async function login() {
    if (!auth) return;
    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ login_hint: cfg.ownerEmail || '' });
    const standalone = matchMedia('(display-mode: standalone)').matches;
    try {
      if (standalone) await fb.signInWithRedirect(auth, provider);
      else await fb.signInWithPopup(auth, provider);
    } catch (e) {
      if (/popup/.test(e.code || '')) await fb.signInWithRedirect(auth, provider);
      else setStatus('error', 'No se pudo iniciar sesión: ' + (e.code || e.message));
    }
  }
  async function logout() { if (auth) await fb.signOut(auth); }

  // Registra este equipo para recibir push (con la app cerrada)
  async function enablePush() {
    if (!user || !fb?.ms || !cfg.vapidKey) return false;
    if (!(await fb.ms.isSupported())) return false;
    const reg = Notify.registration || await navigator.serviceWorker.ready;
    const messaging = fb.ms.getMessaging(app);
    const token = await fb.ms.getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return false;
    const ua = navigator.userAgent;
    const device = /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Celular Android' : 'Tablet Android') : /Windows/i.test(ua) ? 'Laptop Windows' : 'Otro equipo';
    await fb.setDoc(fb.doc(db, 'users', user.uid, 'data', 'devices'), { tokens: { [token]: { device, updated: Date.now() } } }, { merge: true });
    fb.ms.onMessage(messaging, p => App.toast(`${p.notification?.title || 'Jarvis'} — ${p.notification?.body || ''}`));
    pushActive = true; emit();
    return true;
  }

  window.Cloud = {
    init, login, logout, enablePush, onChange: fn => listeners.add(fn),
    get status() { return status; }, get error() { return error; }, get user() { return user; },
    get lastSync() { return lastSync; }, get pushActive() { return pushActive; }, get configured() { return !!cfg.firebase; },
  };
})();
