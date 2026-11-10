/* Voz de Jarvis con la síntesis de voz del sistema (gratis, sin internet en la mayoría de equipos).
   Los navegadores solo permiten hablar después de que el usuario toca la pantalla. */
(function () {
  const synth = window.speechSynthesis;
  let voice = null;

  function pickVoice() {
    if (!synth) return null;
    const vs = synth.getVoices().filter(v => /^es/i.test(v.lang));
    if (!vs.length) return null;
    const male = /(jorge|pablo|ra[uú]l|diego|enrique|carlos|alvaro|álvaro|juan|male|hombre|masculin)/i;
    const latam = /(es-(PE|MX|US|419|CO|AR|CL))/i;
    return vs.find(v => male.test(v.name) && latam.test(v.lang)) || vs.find(v => male.test(v.name))
      || vs.find(v => latam.test(v.lang)) || vs[0];
  }
  if (synth) { voice = pickVoice(); synth.onvoiceschanged = () => { voice = pickVoice(); }; }

  // Divide en frases para que Chrome no corte textos largos
  function chunks(text) {
    return text.replace(/\s+/g, ' ').match(/[^.!?;]+[.!?;]?/g)?.map(s => s.trim()).filter(Boolean) || [];
  }

  function speak(text, { onEnd } = {}) {
    if (!synth || !Store.state.settings.voice) { onEnd?.(); return false; }
    synth.cancel();
    if (!voice) voice = pickVoice();
    const parts = chunks(text);
    // Chrome a veces se queda mudo si se habla justo después de cancelar: se espera un instante
    setTimeout(() => parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'es-PE';
      u.rate = 1.02; u.pitch = 0.85;
      if (i === parts.length - 1) { u.onend = () => onEnd?.(); u.onerror = () => onEnd?.(); }
      synth.speak(u);
    }), 80);
    return true;
  }

  const stop = () => synth?.cancel();
  const speaking = () => !!synth?.speaking;
  const available = () => !!synth;

  window.Voice = { speak, stop, speaking, available, get voiceName() { return voice ? `${voice.name} (${voice.lang})` : 'predeterminada'; } };
})();
