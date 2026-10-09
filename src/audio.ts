import type { Surface } from './player';
import type { ImpactSound } from './props';
import type { Ambience } from './world';

// Everything is synthesized: HVAC rumble, fluorescent hum, footsteps, and the city 47 floors down;
// or, out on the street, the traffic, the el and the cars going by.

/** A looping noise voice whose loudness, tone and pan the scene sets every frame. */
type Voice = { gain: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode };

const STEP: Record<Surface, { type: BiquadFilterType; freq: number; vol: number }> = {
  carpet: { type: 'lowpass', freq: 520, vol: 0.35 },
  wood: { type: 'bandpass', freq: 900, vol: 0.45 },
  stone: { type: 'bandpass', freq: 2200, vol: 0.4 },
};

const IMPACT: Record<ImpactSound, { freq: number; q: number; len: number; vol: number; ring?: number }> = {
  thud: { freq: 240, q: 1.0, len: 0.18, vol: 0.6 },
  plastic: { freq: 1100, q: 1.6, len: 0.07, vol: 0.45 },
  metal: { freq: 2400, q: 4, len: 0.2, vol: 0.3, ring: 3100 },
  ceramic: { freq: 2800, q: 6, len: 0.14, vol: 0.3, ring: 3600 },
  paper: { freq: 3200, q: 0.7, len: 0.05, vol: 0.12 },
  wood: { freq: 650, q: 2.5, len: 0.1, vol: 0.5 },
  soft: { freq: 170, q: 0.8, len: 0.14, vol: 0.4 },
};

export class Soundscape {
  ambience: Ambience = 'office';
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private train: (Voice & { squeal: GainNode }) | null = null;
  private cars: Voice | null = null;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(ctx.destination);
    this.noise = this.makeNoise(2, false);
    if (this.ambience === 'street') {
      this.streetBed();
      this.train = { ...this.voice(true), squeal: ctx.createGain() };
      // Wheels grinding on the curve and the brakes: two detuned squeals that only sound while braking.
      this.train.squeal.gain.value = 0;
      for (const f of [2950, 3320]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 12;
        o.connect(bp).connect(this.train.squeal);
        o.start();
      }
      this.train.squeal.connect(this.train.pan);
      this.cars = this.voice(false);
    } else {
      this.hvac();
      this.hum();
    }
    this.scheduleCity();
  }

  /** The train on the el: loudness 0..1, how hard it's braking 0..1, and where it is, -1 left to 1 right. */
  setTrain(level: number, brake: number, pan: number) {
    const v = this.train;
    if (!v || this.ctx?.state !== 'running') return;
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(level * 0.55, t, 0.08);
    v.lp.frequency.setTargetAtTime(160 + level * 700, t, 0.1);
    v.squeal.gain.setTargetAtTime(brake * level * 0.012, t, 0.15);
    v.pan.pan.setTargetAtTime(pan * 0.8, t, 0.1);
  }

  /** Cars going by on the avenue: loudness 0..1 of the nearest, and which side it's on. */
  setCars(level: number, pan: number) {
    const v = this.cars;
    if (!v || this.ctx?.state !== 'running') return;
    const t = this.ctx.currentTime;
    v.gain.gain.setTargetAtTime(level * 0.35, t, 0.12);
    v.lp.frequency.setTargetAtTime(300 + level * 1400, t, 0.12);
    v.pan.pan.setTargetAtTime(pan * 0.7, t, 0.12);
  }

  /** An OMNY reader taking a tap: one short bright beep. */
  beep() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1760;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.005);
    g.gain.setValueAtTime(0.03, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.18);
  }

  /** A turnstile's arms turning over: a heavy ratchet clack and a metal ring. */
  clunk() {
    this.impact('metal', 4, 0.5);
    this.impact('thud', 5, 0.5);
  }

  /** The doors on the el: two falling tones, then a pause, the way they do it at 36 Av. */
  chime(level: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || level < 0.01) return;
    [[659, 0], [523, 0.32]].forEach(([f, dt]) => {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 * level, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.65);
    });
  }

  pause() {
    void this.ctx?.suspend();
  }

  footstep(surface: Surface, running: boolean) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const cfg = STEP[surface];
    const vol = cfg.vol * (running ? 1.3 : 1) * (0.85 + Math.random() * 0.3);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = cfg.type;
    filter.frequency.value = cfg.freq * (0.9 + Math.random() * 0.2);
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(filter).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5, 0.2);

    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(90, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(vol * 0.5, t + 0.005);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    thump.connect(tg).connect(this.out);
    thump.start(t);
    thump.stop(t + 0.12);
  }

  /** Something hitting something: a filtered noise knock, plus a ring for metal and ceramic. */
  impact(kind: ImpactSound, strength: number, distance: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const cfg = IMPACT[kind];
    const vol = (Math.min(1, strength / 5) * cfg.vol) / (1 + distance * 0.35);
    if (vol < 0.005) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = cfg.freq * (0.85 + Math.random() * 0.3);
    f.Q.value = cfg.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg.len);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5, cfg.len + 0.05);
    if (cfg.ring) {
      const o = ctx.createOscillator();
      o.frequency.value = cfg.ring * (0.9 + Math.random() * 0.2);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(vol * 0.25, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + cfg.len * 1.6);
      o.connect(og).connect(this.out);
      o.start(t);
      o.stop(t + cfg.len * 1.6 + 0.02);
    }
  }

  /** Sitting down or standing up: a seat creak and a soft cushion thump. */
  creak() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150 + Math.random() * 40, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.28);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(bp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.32);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.35, t + 0.02);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(lp).connect(tg).connect(this.out);
    src.start(t, Math.random(), 0.3);
  }

  private makeNoise(seconds: number, brown: boolean) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private voice(brown: boolean): Voice {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(4, brown);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(lp).connect(gain).connect(pan).connect(this.out);
    src.start();
    return { gain, lp, pan };
  }

  /** Out on the street at night: the city's low roar, a little wind, and a transformer buzzing somewhere. */
  private streetBed() {
    const ctx = this.ctx!;
    const roar = this.voice(true);
    roar.lp.frequency.value = 520;
    roar.gain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = ctx.createGain();
    depth.gain.value = 0.05;
    lfo.connect(depth).connect(roar.gain.gain);
    lfo.start();
    const wind = this.voice(false);
    wind.lp.type = 'bandpass';
    wind.lp.frequency.value = 650;
    wind.lp.Q.value = 0.6;
    wind.gain.gain.value = 0.012;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.11;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.008;
    gust.connect(gustDepth).connect(wind.gain.gain);
    gust.start();
    const o = ctx.createOscillator();
    o.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.value = 0.002;
    o.connect(g).connect(this.out);
    o.start();
  }

  private hvac() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    src.connect(lp).connect(g).connect(this.out);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.05;
    lfo.connect(depth).connect(g.gain);
    lfo.start();
  }

  private hum() {
    const ctx = this.ctx!;
    for (const [freq, vol] of [[120, 0.006], [240, 0.003]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.out);
      o.start();
    }
  }

  private scheduleCity() {
    const next = () =>
      setTimeout(() => {
        if (this.ctx?.state === 'running') {
          if (Math.random() < 0.55) this.siren();
          else this.horn();
        }
        next();
      }, 14000 + Math.random() * 30000);
    next();
  }

  /** A distant wailing siren, muffled by the glass up in the office. */
  private siren() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 8 + Math.random() * 5;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.18 + Math.random() * 0.15;
    const depth = ctx.createGain();
    depth.gain.value = 320;
    lfo.connect(depth).connect(o.frequency);
    const near = this.ambience === 'street';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = near ? 2400 : 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(near ? 0.035 : 0.02, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.random() * 1.6 - 0.8, t);
    pan.pan.linearRampToValueAtTime(Math.random() * 1.6 - 0.8, t + dur);
    o.connect(lp).connect(g).connect(pan).connect(this.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur);
    lfo.stop(t + dur);
  }

  /** One or two honks, far below the office or a few blocks off on the street. */
  private horn() {
    const ctx = this.ctx!;
    const honks = 1 + Math.floor(Math.random() * 2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const near = this.ambience === 'street';
    const vol = near ? 0.03 : 0.012;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = near ? 1800 : 650;
    lp.connect(pan).connect(this.out);
    for (let i = 0; i < honks; i++) {
      const t = ctx.currentTime + i * 0.35;
      const len = 0.18 + Math.random() * 0.3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + len);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
      g.connect(lp);
      for (const f of [349, 440]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(g);
        o.start(t);
        o.stop(t + len + 0.06);
      }
    }
  }
}
