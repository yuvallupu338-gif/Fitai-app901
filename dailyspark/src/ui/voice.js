/*
 * voice.js — reading the spark out loud.
 *
 * Built on the browser's own speech synthesis rather than a hosted voice, which
 * makes it free, offline and private — the text never leaves the device — at
 * the cost of the voice being whatever the operating system ships. For Hebrew
 * that varies a lot, and on some desktops there is no Hebrew voice at all.
 *
 * So the control is only rendered when a usable voice actually exists.
 * Offering a button that produces silence, or Hebrew read in an American
 * accent, is worse than not offering one.
 *
 * The spec files this under a paid tier. Here it is available to everyone,
 * because for a person who cannot comfortably read a phone screen this is not a
 * premium feature, it is the only way in.
 */

const state = { voices: [], picked: null, speaking: false };

function loadVoices() {
  if (!('speechSynthesis' in window)) return [];
  state.voices = window.speechSynthesis.getVoices() || [];
  state.picked = pickHebrew(state.voices);
  return state.voices;
}

/*
 * Prefer a Hebrew voice; fall back to nothing.
 *
 * `lang` comes back as "he-IL" or "he_IL" or occasionally "iw-IL" — the old ISO
 * code for Hebrew, which some platforms still emit — so all three are matched.
 */
function pickHebrew(voices) {
  const hebrew = voices.filter((v) => /^(he|iw)([-_]|$)/i.test(v.lang || ''));
  if (!hebrew.length) return null;
  /* A local voice is instant and works offline; a network voice stutters on a
   * bad connection, which for a two-sentence card is the whole experience. */
  return hebrew.find((v) => v.localService) || hebrew[0];
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  /* Chrome populates the list asynchronously and fires this once, sometimes
   * after the first render — hence the reload rather than a single read. */
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

export function available() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  if (!state.voices.length) loadVoices();
  return !!state.picked;
}

export function speaking() {
  return state.speaking;
}

export function stop() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  state.speaking = false;
}

/*
 * Read a spark.
 *
 * The three parts are spoken as separate utterances rather than one joined
 * string, so the synthesiser puts a real pause between the idea and the
 * instruction. One long string runs them together and the action — the only
 * part that matters — arrives as a subordinate clause.
 */
export function speakEntry(entry, onEnd) {
  if (!available()) return false;
  stop();

  const parts = [entry.title, entry.body, entry.action].filter(Boolean);
  state.speaking = true;

  parts.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = state.picked;
    u.lang = state.picked.lang || 'he-IL';
    /* Slightly under normal. The default rate reads a two-line card like a
     * disclaimer, and this text is meant to land. */
    u.rate = 0.94;
    u.pitch = 1;
    if (i === parts.length - 1) {
      u.onend = () => { state.speaking = false; if (onEnd) onEnd(); };
      u.onerror = () => { state.speaking = false; if (onEnd) onEnd(); };
    }
    window.speechSynthesis.speak(u);
  });
  return true;
}

/** Human name of the voice in use, for the settings screen. */
export function voiceName() {
  return state.picked ? state.picked.name : null;
}
