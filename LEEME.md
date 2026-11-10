# J.A.R.V.I.S. · Ramos

## Abrir en la laptop
- Doble clic en **JARVIS.vbs** (o en `iniciar.bat`). Se abre como ventana propia, sin consola.
- Para apagar el servidor local: **Detener JARVIS.bat**.
- Primera vez: AJUSTES → ACTIVAR NOTIFICACIONES. Para dejarlo en el menú Inicio y la barra de tareas:
  en la ventana de JARVIS, menú ⋮ → *Instalar J.A.R.V.I.S.* (Chrome) o *Aplicaciones → Instalar* (Edge).

## Celular, tablet y nube
Sigue **GUIA_INSTALACION.md** (Firebase + GitHub Pages). El APK se genera una vez que la app está publicada.

## Carpetas
- `index.html`, `css/`, `js/`, `icons/`, `data/`, `sw.js`, `manifest.webmanifest` → la app
- `backend/`, `workflows-github/`, `firestore.rules` → servidor en la nube (noticias, avisos push, Classroom/Gmail)
- `herramientas/` → autorización de Classroom/Gmail

## Novedades de la versión 3 (noviembre 2026)
- **Colores de tu marca**: azul noche con naranja y magenta, e ícono nuevo (engranaje con señal de vibración).
- **Pregúntale a Jarvis** (pestaña INICIO): escribe o pulsa HABLAR y responde con voz usando tus datos:
  "¿qué me toca ahora?", "¿cómo voy esta semana?", "¿qué entregas tengo?", "¿cómo voy en Termo?", "aconséjeme".
  También obedece: "agrega repasar Termodinámica mañana a las 8 por 2 horas" y "ya terminé el informe".
  Funciona con reglas sobre tus datos (sin internet y sin costo); el botón HABLAR sí necesita internet y Chrome/Edge.
- **Avisos con anticipación**: aviso anticipado (30 min antes, ajustable en AJUSTES) + aviso final de cada actividad;
  entregas 3 días antes, 1 día antes y el mismo día; exámenes 7, 3 y 1 día antes. Con la app abierta, Jarvis los dice en voz alta.
- **Gráficos**: estado del día en INICIO, tendencia de 30 días en % y mapa del mes en AVANCE.
- Jarvis te llama **Frank Ramos** (se cambia en AJUSTES).
