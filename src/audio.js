/**
 * Procedural WebAudio SFX & Playful Noir Detective Bassline for [UPDT] Detective Duck.
 * - Pure WebAudio synth only (no TTS voice clips or external assets).
 * - Signature sounds: webbed-foot flap-flap-flap, comedic duck QUACK!, brass padlock
 *   click-clack & metallic SNICK!, mystery orchestral chord, triumphant fanfare.
 */

const STEP_DURATION = 0.25; // Playful detective swing pulse (~120 BPM 8ths)

// Stealthy playful C-minor / chromatic noir walking bass (Hz; 0 = rest)
const NOIR_BASS = [
  130.81, 0, 146.83, 155.56, 0, 174.61, 185.0, 0,
  196.0, 0, 185.0, 174.61, 0, 155.56, 146.83, 0,
  130.81, 0, 155.56, 0, 196.0, 0, 207.65, 196.0,
  174.61, 0, 155.56, 146.83, 130.81, 0, 98.0, 123.47,
];

// Quirky muted vibraphone mystery notes
const NOIR_VIBES = [
  0, 0, 0, 0, 622.25, 0, 0, 587.33,
  0, 0, 523.25, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 783.99, 0, 739.99, 0,
  622.25, 0, 587.33, 0, 523.25, 0, 0, 0,
];

export class DetectiveAudioManager {
  constructor() {
    this.musicOn = true;
    this.sfxOn = true;
    this._ctx = null;
    this._master = null;
    this._sfxGain = null;
    this._musicGain = null;
    this._noiseBuf = null;
    this._unlocked = false;
    this._musicAccum = 0;
    this._musicStep = 0;
  }

  _ensureCtx() {
    if (this._ctx) return this._ctx;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);

      const sfx = ctx.createGain();
      sfx.gain.value = this.sfxOn ? 0.82 : 0.0;
      sfx.connect(master);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1650;
      lp.Q.value = 0.8;

      const music = ctx.createGain();
      music.gain.value = this.musicOn ? 0.13 : 0.0;
      music.connect(lp);
      lp.connect(master);

      this._ctx = ctx;
      this._master = master;
      this._sfxGain = sfx;
      this._musicGain = music;
      return ctx;
    } catch {
      return null;
    }
  }

  _getNoiseBuf() {
    if (!this._ctx) return null;
    if (this._noiseBuf) return this._noiseBuf;
    const sr = this._ctx.sampleRate || 44100;
    const len = Math.floor(sr * 0.45);
    const buf = this._ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let s = 0x33a91c5d;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 2147483648 - 1;
    }
    this._noiseBuf = buf;
    return buf;
  }

  unlock() {
    const ctx = this._ensureCtx();
    if (!ctx) return false;
    this._unlocked = true;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  setMusicOn(on) {
    this.musicOn = Boolean(on);
    if (this._ctx && this._musicGain) {
      const now = this._ctx.currentTime;
      this._musicGain.gain.cancelScheduledValues(now);
      this._musicGain.gain.setTargetAtTime(this.musicOn ? 0.13 : 0.0, now, 0.025);
    }
    if (!this.musicOn) this._musicAccum = 0;
  }

  setSfxOn(on) {
    this.sfxOn = Boolean(on);
    if (this._ctx && this._sfxGain) {
      const now = this._ctx.currentTime;
      this._sfxGain.gain.cancelScheduledValues(now);
      this._sfxGain.gain.setTargetAtTime(this.sfxOn ? 0.82 : 0.0, now, 0.015);
    }
  }

  getState() {
    return { musicOn: this.musicOn, sfxOn: this.sfxOn, unlocked: this._unlocked };
  }

  stepMusic(dt = 0.016) {
    if (!this.musicOn || !this._unlocked || !this._ctx || this._ctx.state !== 'running') return;
    const cdt = Math.min(Math.max(dt || 0, 0), 0.12);
    this._musicAccum += cdt;
    while (this._musicAccum >= STEP_DURATION) {
      this._musicAccum -= STEP_DURATION;
      this._triggerMusicStep(this._musicStep);
      this._musicStep = (this._musicStep + 1) % 32;
    }
  }

  _musicTone(freq, type, start, dur, peak, attack = 0.01) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(this._musicGain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  _triggerMusicStep(step) {
    const ctx = this._ctx;
    if (!ctx || !this._musicGain) return;
    const now = ctx.currentTime + 0.01;
    const bass = NOIR_BASS[step];
    if (bass > 0) {
      // Plucked upright noir bass
      this._musicTone(bass, 'triangle', now, 0.22, 0.42, 0.006);
      this._musicTone(bass * 0.5, 'sine', now, 0.20, 0.28, 0.005);
    }
    const vibe = NOIR_VIBES[step];
    if (vibe > 0) {
      this._musicTone(vibe, 'sine', now, 0.45, 0.16, 0.008);
    }
    // Soft jazz brush on beats 2 & 6
    if (step % 4 === 2) {
      const buf = this._getNoiseBuf();
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.08, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        src.connect(hp);
        hp.connect(g);
        g.connect(this._musicGain);
        src.start(now);
        src.stop(now + 0.08);
      }
    }
  }

  _canSfx() {
    if (!this.sfxOn) return false;
    const ctx = this._ensureCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  _tone({ freq = 440, endFreq = null, type = 'triangle', delay = 0, dur = 0.12, gain = 0.24, attack = 0.004 }) {
    if (!this._ctx || !this._sfxGain) return;
    const now = this._ctx.currentTime + delay;
    const osc = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this._sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _noise({ delay = 0, dur = 0.06, gain = 0.18, filterType = 'bandpass', freq = 1400, q = 1.6 }) {
    if (!this._ctx || !this._sfxGain) return;
    const buf = this._getNoiseBuf();
    if (!buf) return;
    const now = this._ctx.currentTime + delay;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const flt = this._ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(freq, now);
    flt.Q.value = q;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this._sfxGain);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  /** Playful webbed-foot *flap-flap* slap on tile/wood floors! */
  playDuckStep(alt = false) {
    if (!this._canSfx()) return;
    const base = alt ? 245 : 210;
    this._noise({ dur: 0.042, gain: 0.14, filterType: 'bandpass', freq: alt ? 1150 : 940, q: 2.2 });
    this._tone({ freq: base, endFreq: base * 0.55, type: 'triangle', dur: 0.048, gain: 0.11, attack: 0.002 });
  }

  /** Hilarious comedic mallard QUACK! (with optional double-quack shimmer) */
  playQuack(doubleQuack = false) {
    if (!this._canSfx()) return;
    const fireOne = (delay, pitchMult) => {
      const ctx = this._ctx;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const bp = ctx.createBiquadFilter();
      const g = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340 * pitchMult, now);
      osc.frequency.exponentialRampToValueAtTime(480 * pitchMult, now + 0.045);
      osc.frequency.exponentialRampToValueAtTime(255 * pitchMult, now + 0.16);

      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1050 * pitchMult, now);
      bp.frequency.exponentialRampToValueAtTime(1650 * pitchMult, now + 0.06);
      bp.frequency.exponentialRampToValueAtTime(820 * pitchMult, now + 0.16);
      bp.Q.value = 4.2;

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.42, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this._sfxGain);
      osc.start(now);
      osc.stop(now + 0.20);
    };
    fireOne(0, 1.0);
    if (doubleQuack) fireOne(0.16, 1.14);
    // Clue-pulse sparkle chime
    this._tone({ freq: 880, endFreq: 1318.5, type: 'sine', delay: 0.06, dur: 0.20, gain: 0.12 });
  }

  playJump() {
    if (!this._canSfx()) return;
    this._tone({ freq: 240, endFreq: 560, type: 'sine', dur: 0.13, gain: 0.22, attack: 0.005 });
    this._tone({ freq: 380, endFreq: 720, type: 'triangle', dur: 0.09, gain: 0.10, attack: 0.005 });
  }

  playClick() {
    if (!this._canSfx()) return;
    this._tone({ freq: 680, endFreq: 460, type: 'triangle', dur: 0.04, gain: 0.18, attack: 0.002 });
  }

  /** Heavy mechanical brass padlock tumbler *click-clack*! */
  playTumblerClick(isMatched = false) {
    if (!this._canSfx()) return;
    this._noise({ dur: 0.025, gain: 0.22, filterType: 'bandpass', freq: 2600, q: 3.0 });
    this._tone({ freq: 520, endFreq: 210, type: 'square', dur: 0.032, gain: 0.12, attack: 0.002 });
    this._tone({ freq: 780, endFreq: 420, type: 'triangle', delay: 0.03, dur: 0.035, gain: 0.14, attack: 0.002 });
    if (isMatched) {
      this._tone({ freq: 1046.5, type: 'sine', delay: 0.045, dur: 0.14, gain: 0.18, attack: 0.004 });
    }
  }

  /** Dramatic metallic *SNICK!* pop-open when 4-digit padlock unlocks! */
  playPadlockUnlock() {
    if (!this._canSfx()) return;
    this._noise({ dur: 0.055, gain: 0.30, filterType: 'highpass', freq: 3200, q: 1.4 });
    this._tone({ freq: 1200, endFreq: 480, type: 'square', dur: 0.05, gain: 0.18, attack: 0.002 });
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', delay: 0.07 + i * 0.055, dur: 0.32, gain: 0.22 });
    });
  }

  /** Dramatic mystery orchestral chord stinger when discovering physical evidence */
  playClueFound() {
    if (!this._canSfx()) return;
    // Noir mystery swell (Cm9 arpeggio)
    const notes = [261.63, 311.13, 392.0, 466.16, 587.33];
    notes.forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', delay: i * 0.055, dur: 0.42, gain: 0.20, attack: 0.01 });
      this._tone({ freq: f * 2, type: 'sine', delay: i * 0.055, dur: 0.28, gain: 0.07, attack: 0.01 });
    });
  }

  /** Gentle lighthearted comic quack on wrong guess (never harsh!) */
  playGentleWrong() {
    if (!this._canSfx()) return;
    this._tone({ freq: 360, endFreq: 240, type: 'triangle', dur: 0.14, gain: 0.22 });
    this._tone({ freq: 290, endFreq: 195, type: 'triangle', delay: 0.13, dur: 0.18, gain: 0.20 });
  }

  /** Triumphant Detective Fanfare when catching the culprit! */
  playCaseSolved() {
    if (!this._canSfx()) return;
    const fanfare = [
      { f: 523.25, d: 0.00, dur: 0.16 },
      { f: 659.25, d: 0.12, dur: 0.16 },
      { f: 783.99, d: 0.24, dur: 0.16 },
      { f: 1046.5, d: 0.38, dur: 0.55 },
      { f: 783.99, d: 0.38, dur: 0.55 },
      { f: 659.25, d: 0.38, dur: 0.55 },
    ];
    for (const n of fanfare) {
      this._tone({ freq: n.f, type: 'triangle', delay: n.d, dur: n.dur, gain: 0.24, attack: 0.008 });
      this._tone({ freq: n.f * 2, type: 'sine', delay: n.d, dur: n.dur * 0.8, gain: 0.08, attack: 0.01 });
    }
  }
}
