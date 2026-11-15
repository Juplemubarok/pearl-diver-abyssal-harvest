// Synthesized sound only — every effect is built from oscillators and gain
// envelopes in the Web Audio API, no audio files, no network. Importing this
// module (or calling createAudio) in Node, where there is no window or
// AudioContext, must not throw: every method degrades to a silent no-op and
// the context is only created lazily, on the first resume() after user input.

function hasAudio() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return typeof Ctor === 'function' ? Ctor : null;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  const AudioCtor = hasAudio();

  function ensureContext() {
    if (ctx || !AudioCtor) return ctx;
    try {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  }

  function resume() {
    if (!ensureContext()) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      // Audio is best-effort; a failed resume must never break the game.
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (master && ctx) {
      try {
        master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      } catch {
        // Ignore: muting is cosmetic.
      }
    }
  }

  /**
   * Play one note: a sine/triangle oscillator with a quick attack and an
   * exponential decay into silence. Returns false when audio is unavailable.
   */
  function note({ freq, freqEnd, type = 'sine', at = 0, dur = 0.18, vol = 0.5 }) {
    if (!ensureContext()) return false;
    try {
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd && freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      return true;
    } catch {
      return false;
    }
  }

  /** A short filtered-noise thud for taking a hit. */
  function thud() {
    if (!ensureContext()) return;
    try {
      const t0 = ctx.currentTime;
      const dur = 0.22;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.7, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t0);
    } catch {
      // Best-effort only.
    }
  }

  /** Pickup chime; the pitch climbs with the combo (1..5). */
  function pickup(combo = 1) {
    const step = Math.max(1, Math.min(5, combo | 0));
    const base = 620 * 2 ** ((step - 1) / 6);
    note({ freq: base, dur: 0.16, vol: 0.45 });
    note({ freq: base * 1.5, at: 0.06, dur: 0.2, vol: 0.4 });
  }

  function sting() {
    note({ freq: 220, freqEnd: 70, type: 'sawtooth', dur: 0.28, vol: 0.4 });
    thud();
  }

  /** Bubble arpeggio for a vent refill. */
  function vent() {
    const notes = [420, 560, 700, 880];
    notes.forEach((freq, i) => {
      note({ freq, at: i * 0.07, dur: 0.16, vol: 0.35 });
    });
  }

  /** Depth-clear chime: a rising major triad. */
  function depthClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      note({ freq, at: i * 0.09, dur: 0.3, vol: 0.4 });
    });
  }

  /** Victory fanfare: a bright major run, then a held tonic. */
  function win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      note({ freq, at: i * 0.11, dur: 0.28, vol: 0.42 });
    });
    note({ freq: 1046.5, at: 0.6, dur: 0.7, vol: 0.4 });
    note({ freq: 1318.5, at: 0.6, dur: 0.7, vol: 0.3 });
  }

  /** Game-over descent: slow falling minor notes. */
  function over() {
    const notes = [392, 311.13, 261.63, 196];
    notes.forEach((freq, i) => {
      note({ freq, at: i * 0.22, type: 'triangle', dur: 0.4, vol: 0.4 });
    });
  }

  function click() {
    note({ freq: 880, dur: 0.07, vol: 0.3 });
  }

  return {
    resume,
    pickup,
    sting,
    vent,
    depthClear,
    win,
    over,
    click,
    setMuted,
    get muted() {
      return muted;
    },
    set muted(value) {
      setMuted(value);
    },
  };
}
