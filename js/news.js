/* Noticias: las prepara el servidor (GitHub Actions) cada madrugada en data/news.json.
   El navegador no puede leer directamente los feeds de noticias por restricciones de seguridad (CORS),
   por eso las recoge el servidor. */
(function () {
  const NEWS = [
    { id: 'local', label: 'TACNA' },
    { id: 'nacional', label: 'PERÚ' },
    { id: 'internacional', label: 'MUNDO' },
  ];
  const TRENDS = [
    { id: 'mineria', label: 'MINERÍA' },
    { id: 'robotica', label: 'ROBÓTICA' },
    { id: 'tecnologia', label: 'TECNOLOGÍA' },
    { id: 'vibraciones', label: 'VIBRACIONES' },
    { id: 'proyectos', label: 'MIS PROYECTOS' },
  ];
  let data = { generated: null, sections: {} };
  let loaded = false;

  async function load() {
    if (location.protocol === 'file:') return data;
    try {
      const r = await fetch('data/news.json', { cache: 'no-cache' });
      if (r.ok) data = await r.json();
    } catch (e) { console.warn('Sin noticias', e); }
    loaded = true;
    return data;
  }

  const items = id => (data.sections?.[id]?.items || []);
  const isFresh = () => data.generated && (Date.now() - new Date(data.generated)) < 36 * 3600e3;

  // Titulares para la voz: los 2 más importantes de cada ámbito + 1 tendencia de cada tema
  function forVoice() {
    const clean = t => String(t).replace(/\s+-\s+[^-]+$/, ''); // quita " - Medio" del final
    const parts = [];
    for (const s of NEWS) {
      const it = items(s.id).slice(0, 2);
      if (it.length) parts.push(`${{ local: 'En Tacna', nacional: 'En el Perú', internacional: 'En el mundo' }[s.id]}: ${it.map(x => clean(x.title)).join('. Además, ')}.`);
    }
    const tr = TRENDS.map(s => items(s.id)[0]).filter(Boolean).slice(0, 3);
    if (tr.length) parts.push(`Tendencias de su interés: ${tr.map(x => clean(x.title)).join('. ')}.`);
    return parts.join(' ');
  }

  window.News = { NEWS, TRENDS, load, items, isFresh, forVoice, get data() { return data; }, get loaded() { return loaded; } };
})();
