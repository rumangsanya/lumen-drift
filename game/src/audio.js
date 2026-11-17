// A small WebAudio synth: no audio files, just oscillators and a breath of filtered noise.
// Browsers keep audio muted until a user gesture, so the context is created lazily by unlock()
// on the first key press or click; every cue is a no-op until then. M toggles the mute.

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.42;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.4);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    } catch {
      context = null;
      master = null;
    }
  }

  /** One oscillator blip: glides from `from` to `to` Hz over `seconds`, then fades out. */
  function tone(from, to, seconds, type, volume, delay) {
    if (context === null || master === null) return;
    const start = context.currentTime + (delay || 0);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A short burst of low-passed noise: the thud of a shard hit, the hush of a dash. */
  function noise(seconds, volume, cutoff, delay) {
    if (context === null || master === null || noiseBuffer === null) return;
    const start = context.currentTime + (delay || 0);
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  return {
    unlock,
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master !== null && context !== null) {
        master.gain.setTargetAtTime(muted ? 0 : 0.42, context.currentTime, 0.02);
      }
      return muted;
    },
    /** A star joins the trail: a bright little blip, rising slightly with each one carried. */
    pickup(carried) {
      tone(620 + carried * 60, 980 + carried * 60, 0.12, 'sine', 0.22);
    },
    /** Stars land in the Beacon: a warm chime, higher and richer as the combo climbs. */
    deliver(combo) {
      const base = 520 + Math.min(combo, 5) * 40;
      tone(base, base, 0.22, 'triangle', 0.26);
      tone(base * 1.5, base * 1.5, 0.3, 'sine', 0.2, 0.06);
      tone(base * 2, base * 2, 0.36, 'sine', 0.12, 0.12);
    },
    /** A shard connects: a low thud under a falling buzz. */
    hit() {
      noise(0.25, 0.5, 420);
      tone(160, 55, 0.3, 'sawtooth', 0.22);
    },
    /** The pulse dash: a quick upward whoosh. */
    dash() {
      noise(0.16, 0.16, 1800);
      tone(300, 720, 0.14, 'sine', 0.1);
    },
    /** The Beacon fills: a small arpeggio, then a held shimmer. */
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let index = 0; index < notes.length; index += 1) {
        tone(notes[index], notes[index], 0.34, 'triangle', 0.24, index * 0.11);
      }
      tone(1318.5, 1318.5, 0.7, 'sine', 0.14, notes.length * 0.11);
    },
    /** Leaving the title screen: two soft notes, up. */
    start() {
      tone(392, 392, 0.14, 'triangle', 0.18);
      tone(587.33, 587.33, 0.2, 'triangle', 0.18, 0.09);
    },
  };
}
