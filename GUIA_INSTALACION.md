# J.A.R.V.I.S. · Ramos — Guía de instalación

La app ya funciona en tu laptop en **modo local** (doble clic en `iniciar.bat`).
Esta guía la lleva a la nube para tenerla en celular, tablet y laptop, con avisos push, noticias y Classroom/Gmail.
Todo es gratis. Tiempo aproximado: 40–60 min la primera vez.

---

## Paso 1 · Probar en la laptop (ya listo)
1. Doble clic en `iniciar.bat` (usa tu Python). Se abre http://localhost:8765.
2. AJUSTES → ACTIVAR NOTIFICACIONES → PROBAR AVISO → PROBAR VOZ.
3. AJUSTES → IMPORTAR RESPALDO → elige `Documentos\JARVIS-privado\mis-datos-2026-II.json` (tus cursos, notas y horario).
   Ese archivo es privado: está fuera de la carpeta del repositorio y nunca se sube a GitHub.

## Paso 2 · Crear la nube (Firebase, con tu Gmail personal)
1. Entra a https://console.firebase.google.com → **Agregar proyecto** → nombre `jarvis-ramos` → sin Google Analytics.
2. **Authentication** → Comenzar → Método de acceso → **Google** → Habilitar → Guardar.
3. **Firestore Database** → Crear base de datos → ubicación `southamerica-east1` → modo producción.
   - Pestaña **Reglas**: borra todo, pega el contenido de `firestore.rules` y **Publicar**.
4. ⚙ **Configuración del proyecto** → General → "Tus apps" → ícono **</>** (Web) → nombre `jarvis` → Registrar.
   Copia el bloque `firebaseConfig` y pégalo en `js/firebase-config.js` en lugar de `firebase: null`.
5. Configuración del proyecto → **Cloud Messaging** → "Certificados push web" → **Generar par de claves**.
   Copia la clave y pégala en `vapidKey` dentro de `js/firebase-config.js`.
6. Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada** → se descarga un `.json`.
   Guárdalo en un lugar seguro: es secreto (paso 4).

## Paso 3 · Publicar la app (GitHub Pages)
1. En GitHub crea un repositorio **público** llamado `jarvis-ramos`
   (público = minutos ilimitados de GitHub Actions; tus datos NO van al repositorio, van a Firebase).
2. Sube TODO el contenido de la carpeta `dasword ramos`.
   Lo más fácil: GitHub Desktop → File → Add local repository → Publish. O arrastrar los archivos en la web.
3. Las tareas automáticas deben quedar en la ruta `.github/workflows/` del repositorio. En la web de GitHub:
   **Add file → Create new file** → escribe el nombre `.github/workflows/noticias.yml` → pega el contenido de
   `workflows-github/noticias.yml` → Commit. Repite con `recordatorios.yml` y `cursos.yml`.
4. Repositorio → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / `(root)` → Save.
   En 1–2 min tu app estará en `https://TU-USUARIO.github.io/jarvis-ramos/`.
5. Firebase → Authentication → **Configuración → Dominios autorizados** → Agregar `TU-USUARIO.github.io`.

## Paso 4 · Secretos para los avisos push y las noticias
Repositorio → **Settings → Secrets and variables → Actions**:
- **New repository secret** `FIREBASE_SERVICE_ACCOUNT` → pega TODO el contenido del `.json` del paso 2.6.
- **New repository secret** `OWNER_EMAIL` → tu Gmail personal (el mismo con el que inicias sesión en la app)
- Pestaña **Variables** → `APP_URL` → `https://TU-USUARIO.github.io/jarvis-ramos/`

Luego: pestaña **Actions** → habilita los workflows → abre "Noticias del día" → **Run workflow** (para probar).

Qué corre solo:
| Tarea | Cuándo | Qué hace |
|---|---|---|
| Noticias del día | 4:35 am y 12:05 pm | Tacna, Perú, mundo, minería, robótica, tecnología, vibraciones y tus proyectos |
| Recordatorios push | cada 10 min | Cada actividad, comidas, informe de 5:00, plan de 21:30, aviso si no planificaste, informe mensual el día 1 |
| Classroom y Gmail | cada 3 h | Entregas y correos de cursos de tu cuenta institucional |

> GitHub puede retrasar las tareas programadas algunos minutos. Con la app abierta los avisos son exactos.

## Paso 5 · Classroom y Gmail institucional (solo lectura)
1. https://console.cloud.google.com → arriba elige el proyecto `jarvis-ramos` (el mismo de Firebase).
2. **APIs y servicios → Biblioteca**: habilita **Google Classroom API** y **Gmail API**.
3. **Pantalla de consentimiento de OAuth** → Externo → nombre "Jarvis Ramos" → tu correo → Guardar.
   - En "Usuarios de prueba" agrega tu correo institucional.
   - Luego pulsa **Publicar app** (En producción). Así el acceso no vence a los 7 días.
     Google mostrará "app no verificada": es normal porque es tu app personal → Avanzado → Continuar.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → App de escritorio** → Descargar JSON.
5. En la carpeta `herramientas`:
   `python obtener_token.py ruta\al\client_secret_XXXX.json`
   Inicia sesión con tu **correo institucional** y acepta.
6. Copia los 3 valores que muestra como secretos en GitHub: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
7. Actions → "Classroom y Gmail" → Run workflow.

⚠ Si la universidad bloquea apps externas en las cuentas institucionales, Google mostrará "acceso bloqueado por el administrador".
En ese caso usa **+ ENTREGA** manual en CURSOS o reenvía los correos de cursos a tu Gmail personal y te adapto el lector a esa cuenta.

## Paso 6 · Instalar en cada equipo
- **Celular/tablet Android**: abre la dirección en Chrome → menú ⋮ → **Instalar app**. Abre JARVIS → AJUSTES →
  INICIAR SESIÓN CON GOOGLE (Gmail personal) → ACTIVAR NOTIFICACIONES.
- **Laptop**: misma dirección en Chrome/Edge → ícono Instalar en la barra → iniciar sesión → activar notificaciones.
- **APK (opcional)**: https://www.pwabuilder.com → pega tu dirección → Package for stores → Android → Download.
  Genera un `.apk` instalable con la misma app (requiere el paso 3).

---

## Cómo se calcula todo
- **Índice de productividad** = Avance ponderado × (0.8 + 0.2 × Puntualidad). Peso de cada tarea = minutos × prioridad (1 · 1.5 · 2).
- **Puntualidad**: tareas marcadas antes del fin de su bloque + 10 min.
- **Nota de planificación (1–10)** = 1 + 9 × (0.4·Anticipación + 0.3·Cobertura de entregas + 0.3·Equilibrio).
  - Anticipación: planificar la noche anterior = 100 %, **al levantarse (hasta las 9:00) = 50 %**, más tarde = 20 %.
  - Bono: +15 pts si confirmas el plan la noche anterior, +5 si es al levantarte.
- **Preparación de examen**: curva del olvido R = e^(−t/S); cada repaso duplica S; dominio = (confianza/5)·R.
- **Notas**: promedio ponderado por créditos; nota necesaria en las unidades que faltan = (Meta·Σpesos − Σnotas·pesos)/Σpesos faltantes.
- **Informe mensual**: calificación = 1 + 9 × (0.5·Índice + 0.2·Puntualidad + 0.3·Planificación), con fortalezas, puntos a mejorar y recomendaciones.

## Estructura
```
index.html, css/hud.css      Interfaz HUD
js/store.js                  Datos locales + estructura
js/seed.js                   Vacío a propósito (tus datos personales van por importación privada)
js/metrics.js                Productividad, planificación, puntos, racha, recompensas
js/study.js                  Repasos, preparación de examen, notas y promedio ponderado
js/advisor.js                Consejos del asistente
js/monthly.js                Informe mensual
js/voice.js, js/news.js      Voz de Jarvis y noticias
js/notify.js, js/cloud.js    Avisos locales, Firebase y push
js/firebase-config.js        ← aquí pegas tu configuración (paso 2)
sw.js, manifest.webmanifest  App instalable / sin conexión / push
backend/                     Tareas automáticas (GitHub Actions)
workflows-github/             Horarios de esas tareas (van en .github/workflows/ del repositorio)
herramientas/obtener_token.py  Autorización de Classroom/Gmail
firestore.rules              Seguridad de la base de datos
```
