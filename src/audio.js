// Stellar Frontier audio engine (v3)
// 100% procedural WebAudio: every sound effect is synthesised once at start-up into a small
// AudioBuffer (OfflineAudioContext), then played back through a light per-voice chain
// (gain -> optional air-absorption lowpass -> stereo pan) with pitch/volume variation, distance
// attenuation, voice limiting and a compressor + limiter master bus. Music is generative.

const SR = 32000; // render rate for SFX buffers (played back resampled; keeps memory small)
const rv = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rv(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function makeNoise(c, kind, dur, sr = c.sampleRate) {
  const n = Math.ceil(dur * sr); const b = c.createBuffer(1, n, sr); const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return b;
}
// Generated impulse response: decaying stereo noise that darkens over time (no samples needed)
function makeIR(c, dur, decay, bright = 0.6) {
  const sr = c.sampleRate, n = Math.ceil(dur * sr), pre = Math.floor(0.012 * sr); const b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre); const k = bright * (1 - t) + 0.04; // one-pole lowpass closing over time
      y += ((Math.random() * 2 - 1) - y) * k; d[i] = y * Math.pow(1 - t, decay) * (i < pre + 400 ? (i - pre) / 400 : 1);
    }
  }
  return b;
}
function tanhCurve(k) { const n = 1024, cu = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cu[i] = Math.tanh(x * k) / Math.tanh(k); } return cu; }

// ---------- tiny offline synthesis toolkit ----------
class Syn {
  constructor(c) { this.c = c; this.out = c.destination; this.nb = {}; }
  noise(kind) { return this.nb[kind] || (this.nb[kind] = makeNoise(this.c, kind, 1.5)); }
  gain(v = 1, to = this.out) { const g = this.c.createGain(); g.gain.value = v; g.connect(to); return g; }
  filt(type, f, q = 0.7, to = this.out, f1, t = 0, d = 0) {
    const b = this.c.createBiquadFilter(); b.type = type; b.Q.value = q; b.frequency.setValueAtTime(f, t);
    if (f1) b.frequency.exponentialRampToValueAtTime(f1, t + d); b.connect(to); return b;
  }
  shaper(k, to = this.out, post = 0.7) { const w = this.c.createWaveShaper(); w.curve = tanhCurve(k); w.oversample = '2x'; const g = this.gain(post, to); w.connect(g); return w; }
  env(g, t, a, v, d) { const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + a); p.exponentialRampToValueAtTime(0.0001, t + a + d); }
  osc({ type = 'sine', f = 440, f1, t = 0, a = 0.002, d = 0.3, v = 0.3, to = this.out, glide, detune = 0 }) {
    const c = this.c, o = c.createOscillator(), g = c.createGain(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + d));
    this.env(g, t, a, v, d); o.connect(g); g.connect(to); o.start(t); o.stop(t + a + d + 0.05); return o;
  }
  nz({ kind = 'white', t = 0, a = 0.001, d = 0.2, v = 0.3, type = 'lowpass', f = 1000, f1, q = 0.7, to = this.out }) {
    const c = this.c, s = c.createBufferSource(); s.buffer = this.noise(kind); s.loop = true;
    const fl = this.filt(type, f, q, undefined, undefined); fl.disconnect(); fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    const g = c.createGain(); this.env(g, t, a, v, d); s.connect(fl); fl.connect(g); g.connect(to); s.start(t, Math.random()); s.stop(t + a + d + 0.05); return s;
  }
  partials(f, ratios, vols, decs, t, to = this.out, a = 0.002) { ratios.forEach((r, i) => this.osc({ f: f * r, t, a, d: decs[i], v: vols[i], to })); }
  brass(f, t, d, v, to = this.out) { // two detuned saws through an enveloped lowpass
    const c = this.c; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(f * 7, t + 0.07); lp.frequency.linearRampToValueAtTime(f * 3.5, t + Math.min(d, 0.5));
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.04); g.gain.setValueAtTime(v * 0.85, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    lp.connect(g); g.connect(to);
    for (const det of [-7, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; const vib = c.createOscillator(); vib.frequency.value = 5.2; const vg = c.createGain(); vg.gain.value = 4; vib.connect(vg); vg.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + d + 0.05); vib.start(t); vib.stop(t + d + 0.05); }
  }
}

// ---------- sound recipes (name: [duration, variants, fn]) ----------
const RECIPES = {
  // --- player weapons ---
  cannon: [0.5, 4, (s) => { const d = s.shaper(3); const p = rv(0.92, 1.08);
    s.osc({ f: 175 * p, f1: 45, d: 0.16, v: 0.9, to: d }); s.osc({ type: 'triangle', f: 450 * p, f1: 120, d: 0.05, v: 0.35, to: d });
    s.nz({ d: 0.012, v: 0.6, type: 'highpass', f: 2500 }); s.nz({ kind: 'pink', d: 0.09, v: 0.6, type: 'bandpass', f: rv(1100, 1500), f1: 500, q: 1.2, to: d });
    s.nz({ kind: 'brown', a: 0.005, d: 0.35, v: 0.35, type: 'lowpass', f: 600, f1: 120 }); }],
  missile: [1.1, 3, (s) => { s.nz({ d: 0.03, v: 0.7, type: 'bandpass', f: 1800, q: 1 }); s.osc({ f: 120, f1: 60, d: 0.1, v: 0.5 });
    s.nz({ kind: 'pink', a: 0.04, d: 0.9, v: 0.7, type: 'bandpass', f: rv(500, 700), f1: rv(2500, 3500), q: 1.5 });
    s.nz({ a: 0.05, d: 0.7, v: 0.25, type: 'highpass', f: 3000, f1: 6000 });
    s.osc({ type: 'sawtooth', f: 70, f1: 110, a: 0.05, d: 0.7, v: 0.3, to: s.filt('lowpass', 300, 1) }); }],
  pulse: [1.6, 2, (s) => { const d = s.shaper(2); s.osc({ f: 110, f1: 28, a: 0.005, d: 1.0, v: 1, to: d });
    s.nz({ kind: 'pink', a: 0.01, d: 1.2, v: 0.7, type: 'lowpass', f: 4000, f1: 150, q: 5 });
    s.osc({ type: 'square', f: 440, f1: 110, d: 0.6, v: 0.15, to: s.filt('bandpass', 1200, 3) });
    for (let i = 0; i < 4; i++) s.osc({ f: rv(600, 1400), f1: rv(150, 300), a: 0.01, d: rv(0.4, 0.8), v: 0.06 });
    s.nz({ d: 0.05, v: 0.5, type: 'highpass', f: 2000 }); }],
  pd: [0.25, 3, (s) => { s.osc({ type: 'square', f: rv(1500, 1800), f1: 400, d: 0.05, v: 0.35, to: s.filt('lowpass', 5000) });
    s.nz({ d: 0.04, v: 0.6, type: 'highpass', f: 3000 }); s.osc({ f: 300, f1: 80, d: 0.06, v: 0.5 }); }],
  droneShot: [0.2, 3, (s) => { s.osc({ type: 'triangle', f: rv(1100, 1300), f1: 350, d: 0.09, v: 0.5 }); s.osc({ f: 2400, f1: 700, d: 0.07, v: 0.2 }); s.nz({ d: 0.01, v: 0.3, type: 'highpass', f: 5000 }); }],
  // --- enemy weapons ---
  enemyLaser: [0.35, 3, (s) => { const bp = s.filt('bandpass', 1500, 2, s.gain(1.6));
    s.osc({ type: 'sawtooth', f: rv(900, 1100), f1: 180, d: 0.22, v: 0.6, to: bp }); s.osc({ type: 'square', f: rv(450, 550), f1: 90, d: 0.22, v: 0.25, to: bp });
    s.nz({ d: 0.01, v: 0.4, type: 'highpass', f: 4000 }); }],
  enemyHeavy: [0.6, 2, (s) => { const d = s.shaper(3); s.osc({ type: 'sawtooth', f: rv(380, 440), f1: 70, d: 0.35, v: 0.6, to: s.filt('lowpass', 2200, 2, d) });
    s.osc({ f: 160, f1: 50, d: 0.2, v: 0.7, to: d }); s.nz({ kind: 'pink', d: 0.2, v: 0.4, type: 'lowpass', f: 3000, f1: 400 }); }],
  // --- impacts ---
  hitHull: [0.45, 4, (s) => { const base = rv(380, 620); s.partials(base, [1, 2.76, 5.4, 8.93].map((r) => r * rv(0.98, 1.02)), [0.35, 0.2, 0.12, 0.07], [0.25, 0.16, 0.1, 0.07], 0);
    s.nz({ d: 0.02, v: 0.8, type: 'highpass', f: 2000 }); s.nz({ kind: 'pink', d: 0.1, v: 0.5, type: 'bandpass', f: 1800, q: 1 }); s.osc({ f: 140, f1: 60, d: 0.1, v: 0.6 }); }],
  shieldHit: [0.9, 3, (s) => { for (let i = 0; i < 6; i++) { const f = rv(1800, 3600); s.osc({ f, f1: f * 0.7, a: 0.005, d: rv(0.3, 0.6), v: 0.12 }); }
    s.nz({ a: 0.002, d: 0.5, v: 0.45, type: 'bandpass', f: 6000, f1: 1200, q: 5 });
    s.osc({ type: 'sawtooth', f: 2400, f1: 300, d: 0.12, v: 0.2, to: s.filt('bandpass', 2000, 3) }); s.osc({ f: 220, f1: 110, d: 0.2, v: 0.35 }); }],
  hullCrunch: [0.8, 3, (s) => { const d = s.shaper(4); s.nz({ kind: 'pink', d: 0.35, v: 0.8, type: 'lowpass', f: 2500, f1: 300, to: d }); s.osc({ f: 120, f1: 40, d: 0.3, v: 0.8, to: d });
    s.partials(rv(220, 300), [1, 2.76, 5.4], [0.3, 0.15, 0.08], [0.4, 0.25, 0.15], 0.01);
    for (let i = 0; i < 6; i++) s.nz({ t: rv(0.02, 0.4), d: 0.01, v: 0.3, type: 'bandpass', f: rv(1500, 4000), q: 5 }); }],
  // --- explosions ---
  boomS: [2.0, 3, (s) => { const d = s.shaper(2.5); s.nz({ d: 0.04, v: 1, type: 'highpass', f: 1200 });
    s.nz({ kind: 'pink', a: 0.004, d: 0.9, v: 0.9, type: 'lowpass', f: rv(3500, 5000), f1: 250, q: 0.8, to: d }); s.osc({ f: rv(70, 90), f1: 30, a: 0.003, d: 0.6, v: 1, to: d });
    s.nz({ kind: 'brown', a: 0.05, d: 1.7, v: 0.7, type: 'lowpass', f: 260, f1: 60 });
    for (let k = ri(8, 14); k > 0; k--) { const t = rv(0.08, 1.3); s.nz({ t, d: rv(0.01, 0.04), v: 0.25 * (1 - t / 1.5) + 0.05, type: 'bandpass', f: rv(2500, 7000), q: rv(4, 10) }); }
    for (let k = 0; k < 10; k++) s.nz({ t: rv(0.05, 0.6), d: 0.006, v: 0.3, type: 'bandpass', f: rv(1500, 3000), q: 3 }); }],
  boomL: [4.2, 2, (s) => { const d = s.shaper(2.2); s.nz({ d: 0.06, v: 1, type: 'highpass', f: 900 });
    s.nz({ kind: 'pink', a: 0.006, d: 2.0, v: 1, type: 'lowpass', f: 3000, f1: 120, q: 0.8, to: d }); s.osc({ f: 58, f1: 22, a: 0.004, d: 1.4, v: 1, to: d });
    s.nz({ kind: 'pink', t: 0.22, a: 0.01, d: 1.2, v: 0.7, type: 'lowpass', f: 2200, f1: 150, to: d }); s.osc({ f: 75, t: 0.22, f1: 30, d: 0.8, v: 0.7, to: d });
    s.nz({ kind: 'brown', a: 0.1, d: 3.6, v: 0.9, type: 'lowpass', f: 220, f1: 45 });
    s.osc({ type: 'sawtooth', f: 90, f1: 55, t: 0.3, a: 0.2, d: 1.5, v: 0.1, to: s.filt('lowpass', 400, 2) });
    for (let k = 0; k < 22; k++) { const t = rv(0.1, 2.8); s.nz({ t, d: rv(0.01, 0.05), v: 0.25 * (1 - t / 3) + 0.04, type: 'bandpass', f: rv(1800, 7000), q: rv(4, 10) }); }
    for (let k = 0; k < 16; k++) s.nz({ t: rv(0.05, 1.0), d: 0.008, v: 0.35, type: 'bandpass', f: rv(1200, 3000), q: 3 }); }],
  // --- mining ---
  rockHit: [0.25, 4, (s) => { for (let k = ri(3, 6); k > 0; k--) s.nz({ t: rv(0, 0.12), d: rv(0.008, 0.03), v: rv(0.3, 0.8), type: 'bandpass', f: rv(1800, 5000), q: rv(2, 6) });
    s.nz({ kind: 'brown', d: 0.12, v: 0.6, type: 'lowpass', f: 400, f1: 100 }); s.osc({ f: rv(90, 140), f1: 50, d: 0.08, v: 0.4 }); }],
  rockS: [1.0, 3, (s) => { s.nz({ d: 0.03, v: 0.8, type: 'bandpass', f: 2500, q: 0.8 }); s.osc({ f: rv(100, 130), f1: 45, d: 0.25, v: 0.9 });
    s.nz({ kind: 'brown', d: 0.4, v: 0.7, type: 'lowpass', f: 900, f1: 150 });
    for (let k = 0; k < 25; k++) { const t = 0.7 * Math.pow(Math.random(), 1.8); s.nz({ t, d: rv(0.004, 0.02), v: rv(0.1, 0.5) * (1 - t), type: 'bandpass', f: rv(600, 3500), q: rv(1, 4) }); } }],
  rockL: [2.2, 2, (s) => { const d = s.shaper(2); s.nz({ d: 0.05, v: 1, type: 'bandpass', f: 2000, q: 0.7 }); s.osc({ f: 70, f1: 28, d: 0.6, v: 1, to: d });
    s.nz({ kind: 'brown', a: 0.02, d: 1.8, v: 0.9, type: 'lowpass', f: 700, f1: 70 }); s.nz({ kind: 'pink', d: 0.5, v: 0.5, type: 'lowpass', f: 2500, f1: 300, to: d });
    for (let k = 0; k < 45; k++) { const t = 1.4 * Math.pow(Math.random(), 1.8); s.nz({ t, d: rv(0.004, 0.025), v: rv(0.1, 0.5) * (1 - t / 1.5), type: 'bandpass', f: rv(500, 3500), q: rv(1, 4) }); } }],
  pickup: [0.5, 2, (s) => { s.partials(1318.5, [1, 2, 3.01, 4.2], [0.5, 0.22, 0.1, 0.05], [0.35, 0.25, 0.18, 0.12], 0); s.nz({ d: 0.03, v: 0.1, type: 'highpass', f: 8000 }); }],
  // --- economy / progression ---
  coins: [1.3, 2, (s) => { s.nz({ d: 0.05, v: 0.5, type: 'lowpass', f: 800 }); s.osc({ f: 180, f1: 90, d: 0.08, v: 0.5 });
    for (let k = 0; k < 7; k++) s.partials(rv(2200, 3200), [1, 1.47, 2.09, 2.56], [0.2, 0.12, 0.08, 0.05], [0.15, 0.1, 0.08, 0.06], 0.03 + k * rv(0.045, 0.065));
    s.partials(1568, [1, 2, 3], [0.3, 0.12, 0.05], [0.8, 0.5, 0.3], 0.34); s.partials(2093, [1, 2], [0.25, 0.1], [0.9, 0.5], 0.4); }],
  upgrade: [1.3, 2, (s) => { s.osc({ type: 'sawtooth', f: 220, f1: 880, a: 0.01, d: 0.35, v: 0.3, to: s.filt('lowpass', 800, 2, s.out, 5000, 0, 0.3) });
    [1046.5, 1318.5, 1568].forEach((f, i) => s.partials(f, [1, 2], [0.18, 0.06], [0.8, 0.4], 0.25 + i * 0.03)); s.nz({ t: 0.25, a: 0.05, d: 0.5, v: 0.12, type: 'highpass', f: 7000 }); }],
  levelUp: [2.2, 1, (s) => { [392, 494, 587, 784, 988, 1175].forEach((f, i) => { const t = i * 0.075; s.osc({ type: 'square', f, t, d: 0.5, v: 0.12, to: s.filt('lowpass', 3000) }); s.osc({ f: f * 2, t, d: 0.6, v: 0.1 }); });
    for (const f of [392, 587, 784, 988]) for (const det of [-8, 8]) s.osc({ type: 'sawtooth', f, detune: det, t: 0.45, a: 0.08, d: 1.4, v: 0.05, to: s.filt('lowpass', 2500, 0.7) });
    s.nz({ a: 0.4, d: 0.3, v: 0.15, type: 'bandpass', f: 1000, f1: 8000, q: 2 }); s.partials(1568, [1, 2.01], [0.12, 0.05], [1.3, 0.8], 0.45); }],
  quest: [2.4, 1, (s) => { s.brass(587.3, 0, 0.18, 0.18); s.brass(740, 0.16, 0.18, 0.18); s.brass(880, 0.32, 0.25, 0.2);
    for (const f of [587.3, 740, 880, 1174.7]) s.brass(f, 0.55, 1.6, 0.1); s.partials(2349, [1, 2.01], [0.1, 0.04], [1.5, 0.9], 0.55);
    s.osc({ f: 95, f1: 70, t: 0.55, d: 0.6, v: 0.5 }); s.nz({ kind: 'pink', t: 0.55, d: 0.3, v: 0.3, type: 'lowpass', f: 1200 }); }],
  fanfare: [4.6, 1, (s) => { for (const t of [0, 0.08, 0.16, 0.24, 0.32, 0.4]) s.osc({ f: 92, f1: 75, t, d: 0.35, v: 0.35 }); // timpani roll
    s.brass(293.7, 0, 0.13, 0.2); s.brass(293.7, 0.14, 0.13, 0.2); s.brass(293.7, 0.28, 0.13, 0.2); s.brass(440, 0.45, 0.4, 0.24);
    for (const f of [146.8, 293.7, 370, 440, 587.3]) s.brass(f, 0.9, 3.0, 0.12); s.osc({ f: 60, f1: 30, t: 0.9, d: 1.4, v: 0.9 });
    s.nz({ t: 0.6, a: 0.3, d: 2.6, v: 0.18, type: 'highpass', f: 5000 }); s.partials(1760, [1, 2.01, 3], [0.1, 0.05, 0.02], [2.5, 1.5, 0.8], 0.95); s.partials(2349, [1, 2.01], [0.07, 0.03], [2.5, 1.5], 1.1); }],
  // --- alerts ---
  alarmLow: [0.6, 1, (s) => { const bp = s.filt('bandpass', 1500, 1.2, s.shaper(1.5)); s.osc({ type: 'square', f: 880, a: 0.005, d: 0.13, v: 0.5, to: bp }); s.osc({ type: 'square', f: 660, t: 0.17, a: 0.005, d: 0.16, v: 0.5, to: bp }); }],
  pirate: [1.7, 1, (s) => { const c = s.c; const out = s.filt('bandpass', 900, 0.8, s.shaper(2.5, s.out, 0.8));
    for (const det of [0, 12]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; const g = c.createGain(); const f = o.frequency;
      f.setValueAtTime(380, 0); f.linearRampToValueAtTime(620, 0.35); f.linearRampToValueAtTime(380, 0.7); f.linearRampToValueAtTime(620, 1.05); f.linearRampToValueAtTime(380, 1.45);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.4, 0.04); g.gain.setValueAtTime(0.4, 1.35); g.gain.linearRampToValueAtTime(0, 1.6); o.connect(g); g.connect(out); o.start(0); o.stop(1.65); }
    s.osc({ type: 'sawtooth', f: 55, a: 0.05, d: 1.4, v: 0.25, to: s.filt('lowpass', 200) }); }],
  // --- UI ---
  tap: [0.08, 3, (s) => { s.osc({ f: rv(1800, 2000), f1: 1500, d: 0.03, v: 0.5 }); s.nz({ d: 0.006, v: 0.3, type: 'highpass', f: 4000 }); s.osc({ f: 700, d: 0.02, v: 0.2 }); }],
  open: [0.4, 1, (s) => { s.nz({ a: 0.08, d: 0.2, v: 0.4, type: 'bandpass', f: 600, f1: 3000, q: 1.5 }); s.osc({ f: 600, f1: 1200, t: 0.05, d: 0.12, v: 0.25 }); s.osc({ f: 1600, t: 0.13, d: 0.1, v: 0.2 }); }],
  close: [0.35, 1, (s) => { s.nz({ a: 0.05, d: 0.18, v: 0.35, type: 'bandpass', f: 3000, f1: 500, q: 1.5 }); s.osc({ f: 1100, f1: 550, t: 0.02, d: 0.12, v: 0.22 }); }],
  save: [1.0, 1, (s) => { const lp = s.filt('lowpass', 6000); for (let i = 0; i < 6; i++) s.osc({ type: 'square', f: rv(2000, 3500), t: i * 0.03, d: 0.02, v: 0.08, to: lp });
    s.partials(659.3, [1, 2, 3], [0.3, 0.1, 0.04], [0.25, 0.15, 0.1], 0.22); s.partials(880, [1, 2, 3], [0.3, 0.1, 0.04], [0.55, 0.3, 0.15], 0.36); }],
  // --- movement ---
  warp: [2.8, 1, (s) => { s.osc({ f: 80, f1: 900, a: 0.85, d: 0.1, v: 0.25 }); s.osc({ type: 'sawtooth', f: 60, f1: 240, a: 0.85, d: 0.15, v: 0.15, to: s.filt('lowpass', 300, 3, s.out, 3000, 0, 0.9) });
    s.nz({ kind: 'pink', a: 0.9, d: 0.15, v: 0.5, type: 'bandpass', f: 200, f1: 5000, q: 2 });
    s.nz({ kind: 'pink', t: 0.95, a: 0.01, d: 1.5, v: 1, type: 'lowpass', f: 5000, f1: 200 }); s.osc({ f: 62, f1: 25, t: 0.95, d: 1.3, v: 0.9 });
    for (let i = 0; i < 5; i++) s.osc({ f: rv(900, 1800), f1: rv(200, 400), t: 0.95, a: 0.01, d: rv(0.8, 1.5), v: 0.05 }); }],
  boost: [1.3, 1, (s) => { s.nz({ kind: 'pink', a: 0.25, d: 0.8, v: 0.6, type: 'bandpass', f: 300, f1: 2500, q: 1.2 }); s.osc({ type: 'sawtooth', f: 50, f1: 120, a: 0.3, d: 0.8, v: 0.25, to: s.filt('lowpass', 500, 1.5) }); s.nz({ d: 0.04, v: 0.4, type: 'highpass', f: 2000 }); }],
  dock: [1.3, 1, (s) => { s.partials(180, [1, 2.76, 5.4], [0.4, 0.2, 0.1], [0.35, 0.2, 0.12], 0); s.nz({ kind: 'pink', d: 0.08, v: 0.6, type: 'lowpass', f: 1200 }); s.osc({ f: 90, f1: 45, d: 0.2, v: 0.6 });
    s.nz({ t: 0.15, a: 0.05, d: 0.6, v: 0.25, type: 'bandpass', f: 5000, q: 1 }); s.partials(240, [1, 2.76, 5.4], [0.3, 0.15, 0.07], [0.25, 0.15, 0.1], 0.38); s.osc({ f: 110, f1: 50, t: 0.38, d: 0.15, v: 0.5 }); }],
  // --- v4: abilities, loot, galaxy ---
  dash: [0.9, 2, (s) => { s.nz({ kind: 'pink', a: 0.01, d: 0.45, v: 0.9, type: 'bandpass', f: 600, f1: 5000, q: 1.6 }); s.osc({ f: 220, f1: 1400, a: 0.005, d: 0.25, v: 0.35 });
    s.osc({ type: 'sawtooth', f: 80, f1: 40, d: 0.4, v: 0.3, to: s.filt('lowpass', 400) }); s.nz({ t: 0.18, d: 0.5, v: 0.25, type: 'highpass', f: 4000, f1: 1500 }); s.osc({ f: 1760, t: 0.2, d: 0.3, v: 0.08 }); }],
  emp: [2.4, 1, (s) => { const d = s.shaper(2.2); s.osc({ f: 90, f1: 30, a: 0.003, d: 1.2, v: 1, to: d }); s.osc({ type: 'square', f: 2400, f1: 120, d: 0.7, v: 0.12, to: s.filt('bandpass', 1500, 2) });
    for (let i = 0; i < 18; i++) s.osc({ type: 'square', f: rv(2000, 6000), t: 0.05 + rv(0, 1.4), a: 0.001, d: 0.02, v: 0.06, to: s.filt('highpass', 2000) });
    s.nz({ kind: 'pink', a: 0.005, d: 1.6, v: 0.7, type: 'lowpass', f: 6000, f1: 150, q: 3 }); s.partials(110, [1, 3.01, 5.03], [0.2, 0.08, 0.04], [1.6, 1.0, 0.6], 0.02); }],
  overload: [2.0, 1, (s) => { s.osc({ f: 180, f1: 720, a: 0.2, d: 0.5, v: 0.25 }); s.osc({ type: 'sawtooth', f: 90, f1: 360, a: 0.2, d: 0.6, v: 0.18, to: s.filt('lowpass', 900, 4, s.out, 3000, 0, 0.6) });
    s.partials(523.3, [1, 1.5, 2, 3], [0.2, 0.12, 0.08, 0.04], [1.4, 1.1, 0.9, 0.6], 0.35); s.nz({ t: 0.3, a: 0.02, d: 1.2, v: 0.2, type: 'bandpass', f: 3000, q: 2 }); s.osc({ f: 70, f1: 40, t: 0.32, d: 0.8, v: 0.6 }); }],
  surge: [1.8, 1, (s) => { const d = s.shaper(3); s.osc({ type: 'sawtooth', f: 55, f1: 220, a: 0.4, d: 0.9, v: 0.35, to: s.filt('lowpass', 300, 6, d, 4000, 0, 0.5) });
    s.osc({ type: 'square', f: 440, f1: 880, a: 0.3, d: 0.5, v: 0.08, to: s.filt('bandpass', 2000, 3) }); s.osc({ f: 60, f1: 30, t: 0.45, d: 0.8, v: 0.8 }); s.nz({ kind: 'pink', t: 0.45, d: 0.9, v: 0.5, type: 'lowpass', f: 3000, f1: 200 }); }],
  deploy: [1.2, 1, (s) => { for (let i = 0; i < 3; i++) { s.osc({ type: 'triangle', f: 600 + i * 200, f1: 1600 + i * 300, t: i * 0.14, d: 0.18, v: 0.25 }); s.nz({ t: i * 0.14, d: 0.12, v: 0.3, type: 'bandpass', f: 2500, q: 2 }); } s.osc({ f: 120, f1: 60, d: 0.3, v: 0.5 }); }],
  lootDrop: [1.2, 2, (s) => { s.partials(1318.5, [1, 2.4, 3.9], [0.18, 0.08, 0.04], [0.9, 0.5, 0.3], 0); s.partials(1975.5, [1, 2.4], [0.12, 0.05], [0.8, 0.4], 0.09); s.nz({ d: 0.3, v: 0.1, type: 'highpass', f: 6000 }); s.osc({ f: 90, f1: 50, d: 0.2, v: 0.3 }); }],
  loot: [1.4, 1, (s) => { [0, 4, 7, 12].forEach((n, i) => s.partials(mtof(76 + n), [1, 2, 3.01], [0.18, 0.06, 0.03], [0.6, 0.35, 0.2], i * 0.07)); s.nz({ t: 0.05, d: 0.4, v: 0.12, type: 'highpass', f: 7000 }); }],
  lootRare: [2.4, 1, (s) => { [0, 7, 12, 16, 19, 24].forEach((n, i) => s.partials(mtof(72 + n), [1, 2, 3.01, 4.2], [0.16, 0.07, 0.03, 0.02], [1.6, 1.0, 0.5, 0.3], i * 0.08));
    s.nz({ kind: 'pink', a: 0.3, d: 1.5, v: 0.15, type: 'bandpass', f: 4000, q: 1 }); s.osc({ f: 65, f1: 40, d: 1.0, v: 0.5 }); }],
  sector: [2.6, 1, (s) => { s.osc({ f: 55, f1: 50, a: 0.5, d: 1.8, v: 0.4 }); s.partials(587.3, [1, 1.5, 2.01], [0.12, 0.06, 0.04], [2.2, 1.6, 1.0], 0.1, s.out, 0.2); s.partials(880, [1, 2.01], [0.08, 0.03], [1.8, 1.0], 0.5, s.out, 0.15);
    s.nz({ kind: 'pink', a: 0.6, d: 1.4, v: 0.18, type: 'bandpass', f: 400, f1: 2400, q: 2 }); }],
  skill: [1.4, 1, (s) => { s.osc({ type: 'triangle', f: 440, f1: 880, a: 0.005, d: 0.25, v: 0.3 }); [0, 7, 12, 19].forEach((n, i) => s.partials(mtof(69 + n), [1, 2, 3], [0.14, 0.05, 0.02], [0.9, 0.5, 0.3], 0.05 + i * 0.06)); s.nz({ t: 0.05, d: 0.5, v: 0.12, type: 'highpass', f: 5000 }); }],
  overheat: [0.9, 1, (s) => { s.nz({ a: 0.01, d: 0.7, v: 0.5, type: 'highpass', f: 2500, f1: 6000 }); s.osc({ type: 'square', f: 300, f1: 180, d: 0.25, v: 0.15, to: s.filt('lowpass', 1500) }); s.osc({ type: 'square', f: 300, f1: 180, t: 0.28, d: 0.25, v: 0.15, to: s.filt('lowpass', 1500) }); }],
  denied: [0.35, 1, (s) => { s.osc({ type: 'square', f: 180, d: 0.12, v: 0.2, to: s.filt('lowpass', 1200) }); s.osc({ type: 'square', f: 140, t: 0.13, d: 0.15, v: 0.2, to: s.filt('lowpass', 1200) }); }],
  shieldDown: [1.2, 1, (s) => { s.osc({ type: 'sawtooth', f: 900, f1: 120, d: 0.7, v: 0.2, to: s.filt('lowpass', 3000, 3) }); s.nz({ d: 0.5, v: 0.4, type: 'bandpass', f: 2000, f1: 300, q: 2 }); s.osc({ f: 80, f1: 40, d: 0.5, v: 0.5 }); }],
  liberate: [5.0, 1, (s) => { // triumphant liberation sting: brass fanfare over a timpani roll, bright major resolve
    for (let i = 0; i < 10; i++) s.osc({ f: 73.4, f1: 70, t: i * 0.06, a: 0.002, d: 0.25, v: 0.25 + i * 0.03 });
    s.brass(293.7, 0, 0.18, 0.22); s.brass(392, 0.2, 0.18, 0.22); s.brass(440, 0.4, 0.5, 0.26);
    for (const f of [293.7, 370, 440, 587.3, 740]) s.brass(f, 0.95, 3.4, 0.13); s.osc({ f: 73.4, f1: 36, t: 0.95, d: 2.0, v: 1 });
    s.partials(1174.7, [1, 2.01, 3], [0.1, 0.05, 0.02], [3.0, 2.0, 1.0], 1.0); s.partials(1480, [1, 2.01], [0.08, 0.03], [3.0, 1.6], 1.2); s.partials(1760, [1, 2.01], [0.06, 0.02], [2.6, 1.4], 1.4);
    s.nz({ t: 0.9, a: 0.4, d: 3.4, v: 0.16, type: 'highpass', f: 5000 }); s.nz({ kind: 'pink', t: 0.95, d: 1.2, v: 0.45, type: 'lowpass', f: 3000, f1: 200 }); }],
  // --- music drums (rendered once, played by the music engine) ---
  kick: [0.5, 1, (s) => { s.osc({ f: 150, f1: 45, a: 0.002, d: 0.35, v: 1, glide: 0.12 }); s.nz({ d: 0.005, v: 0.4, type: 'highpass', f: 3000 }); }],
  snare: [0.4, 2, (s) => { s.nz({ a: 0.001, d: 0.18, v: 0.7, type: 'bandpass', f: 1800, q: 0.7 }); s.osc({ type: 'triangle', f: 190, f1: 160, d: 0.1, v: 0.5 }); s.nz({ d: 0.1, v: 0.3, type: 'highpass', f: 6000 }); }],
  hat: [0.1, 3, (s) => { s.nz({ d: 0.04, v: 0.5, type: 'highpass', f: 7000 }); }],
  impact: [2.4, 1, (s) => { s.osc({ f: 60, f1: 32, d: 1.6, v: 1 }); s.nz({ kind: 'pink', d: 0.9, v: 0.5, type: 'lowpass', f: 2000, f1: 100 }); s.nz({ a: 0.5, d: 1.2, v: 0.12, type: 'highpass', f: 6000 }); }],
};

// mix table: vol, minimum gap (s), max simultaneous, priority, reverb send, pitch var, vol var
const MIX = {
  cannon: [0.42, 0.045, 4, 1, 0.12, 0.06, 0.15], missile: [0.5, 0.1, 3, 1, 0.2, 0.08, 0.1], pulse: [0.8, 0.15, 2, 2, 0.3, 0.05, 0.05],
  pd: [0.28, 0.05, 3, 0, 0.1, 0.08, 0.2], droneShot: [0.22, 0.06, 3, 0, 0.1, 0.1, 0.2],
  enemyLaser: [0.32, 0.05, 4, 0, 0.15, 0.08, 0.2], enemyHeavy: [0.45, 0.08, 3, 1, 0.2, 0.06, 0.15],
  hitHull: [0.33, 0.035, 4, 0, 0.12, 0.1, 0.25], shieldHit: [0.5, 0.08, 2, 2, 0.25, 0.06, 0.1], hullCrunch: [0.62, 0.1, 2, 2, 0.15, 0.06, 0.1],
  boomS: [0.75, 0.03, 4, 2, 0.3, 0.1, 0.12], boomL: [1.0, 0.1, 2, 3, 0.35, 0.06, 0.05],
  rockHit: [0.22, 0.09, 2, 0, 0.08, 0.12, 0.25], rockS: [0.55, 0.04, 3, 1, 0.2, 0.1, 0.15], rockL: [0.8, 0.08, 2, 2, 0.3, 0.06, 0.1],
  pickup: [0.26, 0.03, 3, 0, 0.25, 0, 0.1], coins: [0.5, 0.15, 1, 3, 0.2, 0.02, 0], upgrade: [0.5, 0.1, 2, 3, 0.25, 0.01, 0],
  levelUp: [0.55, 0.5, 1, 4, 0.35, 0, 0], quest: [0.6, 0.5, 1, 4, 0.35, 0, 0], fanfare: [0.75, 1, 1, 5, 0.4, 0, 0],
  alarmLow: [0.3, 0.8, 1, 4, 0.05, 0, 0], pirate: [0.45, 2, 1, 4, 0.2, 0, 0],
  tap: [0.3, 0.03, 2, 5, 0, 0.04, 0.1], open: [0.28, 0.08, 1, 5, 0.1, 0.02, 0], close: [0.26, 0.08, 1, 5, 0.1, 0.02, 0], save: [0.45, 0.3, 1, 5, 0.2, 0, 0],
  warp: [0.6, 1.5, 1, 4, 0.35, 0, 0], boost: [0.5, 0.5, 1, 3, 0.2, 0.03, 0], dock: [0.5, 1, 1, 3, 0.25, 0, 0],
  dash: [0.55, 0.2, 2, 4, 0.25, 0.04, 0], emp: [0.85, 0.5, 1, 5, 0.4, 0, 0], overload: [0.6, 0.5, 1, 5, 0.35, 0, 0], surge: [0.65, 0.5, 1, 5, 0.3, 0, 0], deploy: [0.5, 0.5, 1, 4, 0.25, 0, 0],
  lootDrop: [0.35, 0.15, 2, 3, 0.3, 0.05, 0], loot: [0.45, 0.1, 2, 4, 0.3, 0, 0], lootRare: [0.55, 0.3, 1, 5, 0.4, 0, 0], sector: [0.5, 2, 1, 4, 0.4, 0, 0], skill: [0.5, 0.2, 1, 5, 0.3, 0, 0],
  overheat: [0.35, 1, 1, 3, 0.1, 0, 0], denied: [0.3, 0.2, 1, 5, 0, 0, 0], shieldDown: [0.45, 1, 1, 4, 0.2, 0, 0], liberate: [0.8, 3, 1, 6, 0.45, 0, 0],
};
const LOWRATE = new Set(['liberate', 'emp', 'sector', 'surge', 'overload', 'boomL', 'rockL', 'impact', 'kick', 'pulse', 'warp', 'fanfare', 'boomS', 'quest', 'levelUp', 'boost', 'hullCrunch']); // long, mostly low-frequency sounds
const PENT = [0, 3, 5, 7, 10]; // minor pentatonic steps for pickup combo chimes

// ---------- continuous loops (built on demand, torn down when silent) ----------
class Loop {
  constructor(a, build) { this.a = a; this.build = build; this.g = null; this.n = null; this.level = 0; this.offT = 0; }
  set(level, tc = 0.08) {
    const a = this.a, c = a.ctx;
    if (level > 0.001 && !this.g) { this.g = c.createGain(); this.g.gain.value = 0; this.g.connect(a.sfxIn); this.n = this.build(c, this.g); a.stats.loops++; }
    if (!this.g) return false;
    if (Math.abs(level - this.level) > 0.003) { this.g.gain.setTargetAtTime(level, c.currentTime, tc); this.level = level; }
    if (level <= 0.001) { if (!this.offT) this.offT = c.currentTime; else if (c.currentTime - this.offT > 1.2) this.kill(); } else this.offT = 0;
    return !!this.g;
  }
  kill() { if (!this.g) return; for (const x of this.n.all) { try { if (x.stop) x.stop(); } catch (e) { /* already stopped */ } x.disconnect(); } this.g.disconnect(); this.g = null; this.n = null; this.level = 0; this.offT = 0; this.a.stats.loopsFreed++; }
}

// ---------- generative music ----------
const CHORDS = [ // [bass, ...pad] midi notes, D minor / dorian colours
  [38, 50, 53, 57, 60, 64], [34, 50, 53, 57, 62], [36, 52, 55, 60, 62], [43, 50, 55, 58, 62, 65], [45, 52, 55, 60, 64], [41, 53, 57, 60, 64, 67], [40, 52, 55, 59, 62],
];
const NEXT = [[1, 2, 3, 5], [2, 0, 5], [0, 3, 4], [0, 4, 6, 1], [0, 5, 3], [2, 3, 0], [4, 0, 5]];
const BELL = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];
const MYST = [[38, 62, 65, 68, 73], [37, 61, 64, 68, 71], [34, 58, 62, 65, 70], [39, 63, 66, 69, 74], [36, 60, 63, 66, 71], [41, 65, 68, 72, 75], [33, 57, 61, 64, 68]]; // whole-tone / diminished colours for unexplored space
const KICKS = [[1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]];
const BASS = [[1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1], [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1]];

class Music {
  constructor(a) {
    const c = this.c = a.ctx; this.a = a;
    this.out = c.createGain(); this.out.connect(a.musicBus);
    this.rev = c.createConvolver(); this.rev.buffer = makeIR(c, a.low ? 2.5 : 4.5, 2.2, 0.5); this.revIn = c.createGain(); this.revIn.connect(this.rev); this.rev.connect(this.out);
    const layer = (send) => { const g = c.createGain(); g.gain.value = 0; g.connect(this.out); const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.revIn); return g; };
    this.amb = layer(0.7); this.cbt = layer(0.15); this.dock = layer(0.55);
    this.target = { amb: -1, cbt: -1, dock: -1 };
    // sub drone follows the chord root
    this.droneG = c.createGain(); this.droneG.gain.value = 0.07; this.droneG.connect(this.amb);
    this.drone = [c.createOscillator(), c.createOscillator()]; this.drone[1].type = 'triangle';
    this.drone.forEach((o, i) => { o.frequency.value = mtof(38 + i * 7); o.connect(this.droneG); o.start(); });
    this.chord = CHORDS[0]; this.ci = 0; this.cut = 900; this.density = 0.5;
    const t = c.currentTime + 0.1; this.nextChord = t; this.nextBell = t + 2; this.nextStep = t; this.step = 0; this.nextDock = t; this.nextWind = t + rv(8, 20);
    this.kick = KICKS[0]; this.bass = BASS[0];
    this.timer = setInterval(() => this.schedule(), 120);
  }
  // moods (v4): peaceful (safe/liberated), mysterious (unexplored), tense (pirate territory), intense (boss / big battle)
  setMix(mode, combat, mood = 'peaceful') {
    const c = this.c, now = c.currentTime; let amb = 1, cbt = 0, dock = 0;
    if (mood === 'intense' && mode !== 'dock') combat = Math.max(combat, 1);
    this.mood = mode === 'dock' ? 'peaceful' : mood; this.lite = combat <= 0.02 && this.mood === 'tense';
    if (this.song) { amb = 0; dock = 0; cbt = combat > 0.02 ? 0.32 + 0.18 * combat : 0; } // soundtrack playing: drums-only overlay in fights
    else if (combat > 0.02) { amb = this.mood === 'intense' ? 0.3 : 0.45; cbt = 0.55 + 0.45 * combat; }
    else if (mode === 'dock') { amb = 0.5; dock = 1; }
    else if (this.lite) { amb = 0.85; cbt = 0.3; }
    const set = (k, v, up, down) => { if (Math.abs(this.target[k] - v) < 0.02) return; this[k].gain.setTargetAtTime(v, now, v > this.target[k] ? up : down); this.target[k] = v; };
    set('amb', amb, 2, 1.5); set('cbt', cbt, 0.6, 2.5); set('dock', dock, 1.2, 1.5);
  }
  voice(dest, fn) { // helper so finished music voices disconnect themselves
    const n = fn(); n.src.onended = () => { for (const x of n.all) x.disconnect(); this.a.stats.musicFreed++; }; this.a.stats.music++;
  }
  playChord(t) {
    const c = this.c; const cands = NEXT[this.ci]; this.ci = pick(cands); this.chord = this.mood === 'mysterious' ? MYST[this.ci % MYST.length] : CHORDS[this.ci];
    const dur = pick([8, 10, 12, 12, 14, 16]); const rel = 4; this.cut = clamp(this.cut + rv(-350, 350), 450, 1700);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8; lp.frequency.setValueAtTime(this.cut, t); lp.frequency.linearRampToValueAtTime(clamp(this.cut + rv(-400, 600), 400, 2200), t + dur); lp.connect(this.amb);
    const all = [lp]; let last = null; const per = this.a.low ? 1 : 2;
    for (const m of this.chord.slice(1)) {
      if (Math.random() < 0.15) continue; // drop a voice sometimes for variety
      const g = c.createGain(); const v = 0.032 / per; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + rv(2.5, 4)); g.gain.setValueAtTime(v, t + dur - 0.5); g.gain.linearRampToValueAtTime(0, t + dur + rel); g.connect(lp); all.push(g);
      for (let k = 0; k < per; k++) { const o = c.createOscillator(); o.type = per === 1 ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = per === 1 ? 0 : (k ? 1 : -1) * rv(4, 9); o.connect(g); o.start(t); o.stop(t + dur + rel + 0.1); all.push(o); last = o; }
    }
    if (last) { last.onended = () => { for (const x of all) x.disconnect(); this.a.stats.musicFreed++; }; this.a.stats.music++; }
    this.drone[0].frequency.setTargetAtTime(mtof(this.chord[0]), t, 1.5); this.drone[1].frequency.setTargetAtTime(mtof(this.chord[0] + 7), t, 1.5);
    // dock layer: warm bass note per chord
    this.voice(this.dock, () => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = mtof(this.chord[0] + 12); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 1.5); g.gain.linearRampToValueAtTime(0, t + dur + 1); o.connect(g); g.connect(this.dock); o.start(t); o.stop(t + dur + 1.1); return { src: o, all: [o, g] }; });
    this.nextChord = t + dur;
  }
  bell(t, m, v, dest = this.amb) {
    const c = this.c; const f = mtof(m);
    this.voice(dest, () => { const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = rv(-0.7, 0.7); g.connect(p); p.connect(dest); } else g.connect(dest);
      const o1 = c.createOscillator(); o1.frequency.value = f; const o2 = c.createOscillator(); o2.frequency.value = f * 2.005; const g2 = c.createGain(); g2.gain.value = 0.25;
      o1.connect(g); o2.connect(g2); g2.connect(g); o1.start(t); o2.start(t); o1.stop(t + 3.05); o2.stop(t + 3.05); return { src: o1, all: [o1, o2, g2, g, ...(p ? [p] : [])] }; });
  }
  epiano(t, m, v) { // simple FM electric piano for the docked layer
    const c = this.c, f = mtof(m);
    this.voice(this.dock, () => { const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.8); mod.connect(mg); mg.connect(car.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2); car.connect(g); g.connect(this.dock);
      car.start(t); mod.start(t); car.stop(t + 2.25); mod.stop(t + 2.25); return { src: car, all: [car, mod, mg, g] }; });
  }
  drum(name, t, v) { const a = this.a; const bs = a.buf[name]; if (!bs) return; const c = this.c; const s = c.createBufferSource(); s.buffer = pick(bs); s.playbackRate.value = rv(0.98, 1.02); const g = c.createGain(); g.gain.value = v; s.connect(g); g.connect(this.cbt); s.onended = () => { s.disconnect(); g.disconnect(); a.stats.musicFreed++; }; a.stats.music++; s.start(t); }
  combatStep(t, i) {
    const c = this.c, s = i % 16, dur = this.stepDur;
    if (this.lite) { // tense pirate-space pulse: sparse kick + ticking hats + low bass, no lead
      if (s === 0 || s === 10) this.drum('kick', t, 0.45); if (s % 4 === 2) this.drum('hat', t, 0.12); if (s === 0 && (i / 16) % 4 === 0 && Math.random() < 0.5) this.drum('impact', t, 0.18);
      if (!this.song && (s === 0 || s === 3 || s === 8)) { const root = 26 + (this.chord[0] % 12);
        this.voice(this.cbt, () => { const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(root); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.value = 420;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 3); o.connect(lp); lp.connect(g); g.connect(this.cbt); o.start(t); o.stop(t + dur * 3.1); return { src: o, all: [o, lp, g] }; }); }
      return;
    }
    if (s === 0 && (i / 16) % 2 === 0) { this.kick = Math.random() < 0.6 ? this.kick : pick(KICKS); this.bass = Math.random() < 0.6 ? this.bass : pick(BASS); if (Math.random() < 0.35) this.drum('impact', t, 0.35); }
    if (this.kick[s]) this.drum('kick', t, 0.75);
    if (s === 4 || s === 12) this.drum('snare', t, 0.42); else if (Math.random() < 0.06) this.drum('snare', t, 0.12);
    if (s % 2 === 0) this.drum('hat', t, s % 4 === 2 ? 0.22 : 0.14); else if (Math.random() < 0.5) this.drum('hat', t, 0.07);
    if (this.song) return; // over a song: drums only, so nothing clashes with its key
    if (this.bass[s]) { const root = 26 + (this.chord[0] % 12) + (s % 8 === 6 ? 12 : 0);
      this.voice(this.cbt, () => { const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(root);
        lp.type = 'lowpass'; lp.Q.value = 7; lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(220, t + dur * 1.4);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
        o.connect(lp); lp.connect(g); g.connect(this.cbt); o.start(t); o.stop(t + dur * 1.7); return { src: o, all: [o, lp, g] }; }); }
    if (!this.a.low && s % 2 === 1 && Math.random() < 0.7) { const m = pick(this.chord.slice(1)) + 12;
      this.voice(this.cbt, () => { const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); o.type = 'square'; o.frequency.value = mtof(m); lp.type = 'lowpass'; lp.frequency.value = 1800;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(lp); lp.connect(g); g.connect(this.cbt); o.start(t); o.stop(t + 0.2); return { src: o, all: [o, lp, g] }; }); }
  }
  wind(t) {
    const c = this.c; const d = rv(8, 14);
    this.voice(this.amb, () => { const s = c.createBufferSource(); s.buffer = this.a.noiseBuf; s.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.setValueAtTime(rv(250, 400), t); bp.frequency.linearRampToValueAtTime(rv(900, 1500), t + d * 0.5); bp.frequency.linearRampToValueAtTime(rv(250, 450), t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + d * 0.45); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(bp); bp.connect(g); g.connect(this.amb); s.start(t, rv(0, 1)); s.stop(t + d + 0.1); return { src: s, all: [s, bp, g] }; });
  }
  schedule() {
    const c = this.c; if (c.state !== 'running') return; const now = c.currentTime, ahead = now + 0.5;
    const ambOn = this.target.amb > 0.01 || this.amb.gain.value > 0.003;
    if (!ambOn) { this.nextChord = Math.max(this.nextChord, now); this.nextBell = now + 1; this.nextWind = now + 10; } // soundtrack mode: no pads/bells
    else {
    if (this.nextChord < now) this.nextChord = now + 0.05;
    while (this.nextChord < ahead) this.playChord(this.nextChord);
    if (this.nextBell < now) this.nextBell = now + 0.1;
    while (this.nextBell < ahead) { const t = this.nextBell; this.density = clamp(this.density + rv(-0.15, 0.15), 0.15, 1);
      if (Math.random() < 0.3) { let m = pick(BELL); for (let k = 0; k < ri(2, 4); k++) { this.bell(t + k * rv(0.3, 0.5), m, 0.028); m = BELL[clamp(BELL.indexOf(m) + pick([-2, -1, 1, 2]), 0, BELL.length - 1)]; } }
      else this.bell(t, Math.random() < 0.5 ? pick(this.chord.slice(1)) + 24 : pick(BELL), 0.03);
      this.nextBell = t + rv(1.2, 4.5) / this.density * (this.a.low ? 1.6 : 1) * (this.mood === 'mysterious' ? 1.8 : 1); }
    if (this.nextWind < now) { this.wind(now + 0.1); this.nextWind = now + (this.mood === 'mysterious' ? rv(7, 14) : rv(18, 40)); }
    }
    const cOn = this.target.cbt > 0.01 || this.cbt.gain.value > 0.003; this.stepDur = 60 / 126 / 4;
    if (!cOn) { this.nextStep = now + 0.05; this.step = 0; } else while (this.nextStep < ahead) { this.combatStep(this.nextStep, this.step); this.nextStep += this.stepDur; this.step++; }
    const dOn = this.target.dock > 0.01 || this.dock.gain.value > 0.003;
    if (!dOn) this.nextDock = now + 0.05;
    else while (this.nextDock < ahead) { const t = this.nextDock; if (Math.random() < 0.6) { const n = this.chord.slice(1); this.epiano(t, pick(n) + 12, 0.07); if (Math.random() < 0.3) this.epiano(t + 0.02, pick(n), 0.05); } this.nextDock = t + pick([0.5, 0.75, 1, 1, 1.5]); }
  }
}

// ---------- streamed soundtrack (HTMLAudioElement -> MediaElementSource -> music bus) ----------
const SILENT_WAV = (() => { const n = 400, b = new Uint8Array(44 + n), v = new DataView(b.buffer); const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  let s = ''; for (const x of b) s += String.fromCharCode(x); return 'data:audio/wav;base64,' + btoa(s); })();
const XFADE = 6; // seconds of crossfade between tracks
class Soundtrack {
  constructor(a, tracks, idx = 0, pos = 0) {
    this.a = a; this.tracks = tracks; this.idx = clamp(idx | 0, 0, tracks.length - 1); this.startPos = pos; const c = a.ctx;
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(a.music.out); // a.music.out carries the fanfare duck
    this.level = 1; this.fails = 0; this.dead = false; this.started = false; this.xfading = false; this.single = false;
    this.decks = [0, 1].map(() => { const el = new window.Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', ''); el.loop = false;
      const g = c.createGain(); g.gain.value = 0; let src = null; try { src = c.createMediaElementSource(el); src.connect(g); } catch (e) { /* */ } g.connect(this.out);
      const d = { el, g, src, idx: -1 }; el.addEventListener('error', () => this.onError(d)); el.addEventListener('ended', () => this.onEnded(d)); return d; });
    this.cur = this.decks[0];
  }
  url(i) { return this.tracks[i].src; }
  title(i = this.cur.idx) { const t = this.tracks[i]; return t ? t.title || `Track ${i + 1}` : ''; }
  load(d, i, pos = 0) { d.idx = i; d.el.preload = 'auto'; d.el.src = this.url(i); d.startAt = pos; d.el.load(); if (pos > 0) { const seek = () => { try { if (pos < (d.el.duration || 1e9) - XFADE - 2) d.el.currentTime = pos; } catch (e) { /* */ } }; d.el.addEventListener('loadedmetadata', seek, { once: true }); } }
  // first call must happen inside a user gesture (iOS); primes the second deck too
  start() {
    if (this.started || this.dead) return; this.started = true;
    this.load(this.cur, this.idx, this.startPos); this.fadeTo(this.cur, 1, 0.8); this.play(this.cur, true);
    const o = this.other(); o.el.src = SILENT_WAV; const p = o.el.play(); // unlock the 2nd element inside the gesture (iOS) with a tiny silent clip
    if (p && p.catch) p.then(() => o.el.pause()).catch(() => { /* if it stays locked, next() falls back to one deck */ });
  }
  other(d = this.cur) { return d === this.decks[0] ? this.decks[1] : this.decks[0]; }
  play(d, announce, onBlocked) {
    const ok = () => { this.fails = 0; if (announce && this.a.onTrack) this.a.onTrack(d.idx, this.title(d.idx)); };
    const p = d.el.play(); if (!p || !p.catch) { ok(); return; }
    p.then(ok).catch((e) => { if (e && e.name === 'AbortError') return; if (e && e.name === 'NotAllowedError') { if (onBlocked) onBlocked(); else this.blocked = true; } else this.onError(d); });
  }
  fadeTo(d, v, tc) { const t = this.a.ctx.currentTime; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.setTargetAtTime(v, t, tc); }
  next(step = 1, hard) { // crossfade to the next (or previous) track
    if (this.dead || !this.started) return; const n = (this.cur.idx + step + this.tracks.length) % this.tracks.length; const old = this.cur;
    const nd = this.single ? old : this.other(old);
    if (nd === old) { this.fadeTo(old, 0, 0.4); setTimeout(() => { this.load(old, n); this.fadeTo(old, 1, 0.6); this.play(old, true); }, hard ? 50 : 1500); return; }
    this.load(nd, n); nd.g.gain.value = 0; this.cur = nd; this.idx = n;
    this.play(nd, true, () => { this.single = true; clearTimeout(this.xfT); this.xfading = false; nd.idx = -1; this.cur = old; old.g.gain.cancelScheduledValues(0); this.next(step, hard); });
    this.fadeTo(nd, 1, hard ? 0.4 : XFADE / 4); this.fadeTo(old, 0, hard ? 0.3 : XFADE / 4); this.xfading = true;
    clearTimeout(this.xfT); this.xfT = setTimeout(() => { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); old.idx = -1; this.xfading = false; }, (hard ? 1.5 : XFADE + 1) * 1000);
  }
  onEnded(d) { if (d === this.cur && !this.xfading) this.next(1, true); }
  onError(d) {
    if (this.dead || d.idx < 0 || d !== this.cur) return; this.fails++; console.info('soundtrack: track failed, skipping', d.idx + 1);
    if (this.fails >= this.tracks.length) { this.stop(); this.dead = true; this.a.music.song = false; if (this.a.onSongFail) this.a.onSongFail(); return; }
    this.next(1, true);
  }
  tick() { // starts the crossfade a few seconds before the end
    if (!this.started || this.dead || this.xfading) return; const el = this.cur.el;
    if (el.duration && isFinite(el.duration) && !el.paused && el.currentTime > el.duration - XFADE) this.next(1);
  }
  setLevel(v) { if (Math.abs(v - this.level) < 0.01) return; this.level = v; this.out.gain.setTargetAtTime(v, this.a.ctx.currentTime, 1.2); }
  pause() { for (const d of this.decks) if (!d.el.paused) { d.el.pause(); d.wasPlaying = true; } }
  resume() { if (!this.started || this.dead) return; for (const d of this.decks) if (d.wasPlaying || (d === this.cur && d.el.paused && d.idx >= 0)) { d.wasPlaying = false; this.play(d); } }
  stop() { if (this.cur.idx >= 0) { this.idx = this.cur.idx; this.startPos = this.cur.el.currentTime || 0; } clearTimeout(this.xfT); for (const d of this.decks) { d.el.pause(); d.g.gain.value = 0; } this.started = false; }
  state() { const d = this.cur; return { idx: d.idx >= 0 ? d.idx : this.idx, pos: d.el.currentTime || 0, title: this.title(d.idx >= 0 ? d.idx : this.idx), dur: d.el.duration || 0, playing: !d.el.paused }; }
}

// ---------- the public engine ----------
export class Audio {
  constructor() {
    this.ctx = null; this.vol = { master: 0.8, music: 0.6, sfx: 0.85, mute: false }; this.low = false;
    this.buf = {}; this.ready = false; this.voices = []; this.last = {}; this.lx = 0; this.lz = 0; this.paused = true;
    this.stats = { created: 0, ended: 0, dropped: 0, stolen: 0, loops: 0, loopsFreed: 0, music: 0, musicFreed: 0, played: {} };
    this.laserWant = 0; this.alarmT = 0; this.combat = 0; this.lastCombat = -99; this.tickT = 0; this.mode = 'explore';
    this.sfxOn = true; this.musicOn = true; // legacy flags
    this.onGesture = () => this.init();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, this.onGesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    addEventListener('pagehide', () => { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); if (this.st) this.st.pause(); });
    addEventListener('pageshow', () => this.onVisibility());
  }
  // Called from any user gesture: creates the context the first time, and resumes it afterwards (mobile autoplay rules)
  init() {
    if (document.hidden) return;
    if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); if (this.st) { if (!this.st.started) this.syncSong(true); else if (this.st.blocked) { this.st.blocked = false; this.st.resume(); this.st.play(this.st.cur); } } return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS 17+: play even with the silent switch on */ }
    let c; try { c = this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { c = this.ctx = new AC(); } catch (e2) { return; } }
    // unlock: a silent buffer inside the gesture
    const sb = c.createBuffer(1, 1, 22050); const ss = c.createBufferSource(); ss.buffer = sb; ss.connect(c.destination); ss.start(0); ss.onended = () => ss.disconnect();
    if (c.state !== 'running') c.resume().catch(() => {});
    // master chain: sfx + music -> master -> glue compressor -> brickwall-ish limiter -> out
    this.limiter = c.createDynamicsCompressor(); const L = this.limiter;
    L.threshold.value = -3; L.knee.value = 0; L.ratio.value = 20; L.attack.value = 0.002; L.release.value = 0.12; L.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); const C = this.comp; C.threshold.value = -16; C.knee.value = 10; C.ratio.value = 3.5; C.attack.value = 0.004; C.release.value = 0.25; C.connect(L);
    this.master = c.createGain(); this.master.connect(C);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.sfxIn = c.createGain(); this.sfxIn.connect(this.sfxBus);           // dry
    this.revSend = c.createGain(); this.sfxRev = c.createConvolver(); this.sfxRev.buffer = makeIR(c, 1.8, 2.6, 0.7);
    this.revSend.connect(this.sfxRev); this.sfxRev.connect(this.sfxBus);
    this.noiseBuf = makeNoise(c, 'white', 2); this.brownBuf = makeNoise(c, 'brown', 3);
    this.applyVolumes(true); this.setLow(this.low, true);
    this.buildLoops(); this.music = new Music(this);
    this.initSoundtrack();
    this.render();
  }
  onVisibility() {
    if (!this.ctx) return;
    if (document.hidden) { if (this.ctx.state === 'running') this.ctx.suspend(); if (this.st) this.st.pause(); }
    else { if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); if (this.st && this.wantSong()) this.st.resume(); } // iOS may need the next tap (gesture listener retries)
  }
  // ---------- soundtrack ----------
  wantSong() { return this.musicMode !== 'generated' && this.musicOn && !this.vol.mute; }
  initSoundtrack() {
    if (this.stInit || !this.tracks || !this.tracks.length || !this.ctx) return; this.stInit = true;
    this.st = new Soundtrack(this, this.tracks, this.trackIdx || 0, this.trackPos || 0);
    this.syncSong(true);
  }
  setTracks(list, idx, pos) { this.tracks = list; this.trackIdx = idx; this.trackPos = pos; if (this.ctx) this.initSoundtrack(); }
  setMusicMode(mode) { this.musicMode = mode === 'generated' ? 'generated' : 'soundtrack'; this.syncSong(); }
  syncSong(inGesture) {
    if (!this.music) return; const st = this.st; const want = st && !st.dead && this.musicMode !== 'generated';
    this.music.song = !!want;
    if (!st) return;
    if (want && !st.started) { if (inGesture || this.ctx.state === 'running') st.start(); }
    else if (!want && st.started) st.stop();
  }
  nextTrack(step = 1) { if (this.st && this.st.started) this.st.next(step, true); }
  trackState() { return this.st && !this.st.dead ? this.st.state() : null; }
  async render() { // synthesise every SFX once; frequent sounds first
    const order = ['tap', 'open', 'close', 'cannon', 'rockHit', 'pickup', 'rockS', 'hitHull', 'boomS', 'enemyLaser', 'kick', 'snare', 'hat', ...Object.keys(RECIPES)];
    const done = new Set(); const t0 = performance.now(); let bytes = 0;
    for (const name of order) {
      if (done.has(name)) continue; done.add(name); const [dur, n, fn] = RECIPES[name]; const list = [];
      for (let v = 0; v < n; v++) {
        try {
          const sr = LOWRATE.has(name) ? 22050 : SR; const len = Math.ceil(dur * sr); const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const oc = new OAC(1, len, sr); fn(new Syn(oc), v);
          const b = await (oc.startRendering.length ? new Promise((res) => { oc.oncomplete = (e) => res(e.renderedBuffer); oc.startRendering(); }) : oc.startRendering());
          const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
          if (pk > 0) { const k = 0.9 / pk; for (let i = 0; i < d.length; i++) d[i] *= k; }
          // fade the last 10 ms so nothing clicks
          const f = Math.min(d.length, Math.floor(b.sampleRate * 0.01)); for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
          list.push(b); bytes += d.length * 4;
        } catch (e) { console.warn('audio render failed for', name, e && e.message); }
      }
      if (list.length) this.buf[name] = list;
    }
    this.ready = true; this.renderMs = Math.round(performance.now() - t0); this.bufferBytes = bytes;
  }
  // ---------- settings ----------
  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes(now) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, v = this.vol; const tc = now ? 0.001 : 0.05;
    const curve = (x) => x * x; // perceptual
    this.master.gain.setTargetAtTime(v.mute ? 0 : curve(v.master) * 1.1, t, tc);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? curve(v.sfx) : 0, t, tc);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? curve(v.music) * 0.7 : 0, t, tc);
  }
  setSfx(on) { this.sfxOn = on; this.applyVolumes(); }
  setMusic(on) { this.musicOn = on; this.applyVolumes(); }
  setLow(low, force) {
    if (this.low === low && !force) return; this.low = low; this.maxVoices = low ? 12 : 28;
    if (this.revSend) this.revSend.gain.value = low ? 0 : 1;
    if (this.sfxRev) { try { this.revSend.disconnect(); } catch (e) { /* */ } if (!low) this.revSend.connect(this.sfxRev); }
  }
  get sfxAudible() { return this.ctx && this.ready && !this.vol.mute && this.sfxOn && this.vol.sfx > 0.001 && this.vol.master > 0.001; }
  // ---------- voices ----------
  play(name, o = {}) {
    if (!this.sfxAudible) return null; const bs = this.buf[name]; if (!bs) return null;
    const c = this.ctx, now = c.currentTime; const [vol, gap, cap, pri, rev, pv, vv] = MIX[name];
    if (this.last[name] && now - this.last[name] < gap * (this.low ? 1.5 : 1)) return null;
    let att = 1, pan = 0, dist = 0;
    if (o.x !== undefined) { const dx = o.x - this.lx, dz = o.z - this.lz; dist = Math.hypot(dx, dz); if (dist > 130) return null; att = 1 / (1 + Math.pow(dist / 30, 1.8)); pan = clamp(dx / 24, -1, 1) * 0.85; if (att < 0.02) return null; }
    // voice limiting: per sound and global, stealing the oldest lower-priority voice
    let same = 0; for (const vo of this.voices) if (vo.name === name) same++;
    if (same >= (this.low ? Math.max(1, cap - 2) : cap)) { this.stats.dropped++; return null; }
    if (this.voices.length >= this.maxVoices) {
      let vict = null; for (const vo of this.voices) if (vo.pri <= pri && (!vict || vo.t < vict.t)) vict = vo;
      if (!vict) { this.stats.dropped++; return null; }
      vict.g.gain.setTargetAtTime(0, now, 0.01); try { vict.s.stop(now + 0.05); } catch (e) { /* */ } this.stats.stolen++; this.voices.splice(this.voices.indexOf(vict), 1);
    }
    this.last[name] = now;
    const s = c.createBufferSource(); s.buffer = bs[Math.floor(Math.random() * bs.length)];
    s.playbackRate.value = (o.rate || 1) * (1 + rv(-pv, pv));
    const g = c.createGain(); g.gain.value = vol * (o.vol == null ? 1 : o.vol) * att * (1 + rv(-vv, vv) * 0.5);
    const nodes = [s, g]; let tail = g; s.connect(g);
    if (dist > 35 && !this.low) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1200, 16000 * 35 / dist); tail.connect(lp); tail = lp; nodes.push(lp); }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; tail.connect(p); tail = p; nodes.push(p); }
    tail.connect(this.sfxIn);
    const r = (o.rev == null ? rev : o.rev) * (dist ? 1 + Math.min(1, dist / 60) : 1); // farther = wetter
    if (r > 0 && !this.low) { const sg = c.createGain(); sg.gain.value = r; tail.connect(sg); sg.connect(this.revSend); nodes.push(sg); }
    const vo = { name, s, g, pri, t: now }; this.voices.push(vo); this.stats.created++; this.stats.played[name] = (this.stats.played[name] || 0) + 1;
    s.onended = () => { for (const n of nodes) n.disconnect(); const i = this.voices.indexOf(vo); if (i >= 0) this.voices.splice(i, 1); this.stats.ended++; };
    s.start(now + (o.delay || 0));
    return vo;
  }
  duck(amount = 0.55, hold = 0.25) { if (!this.music) return; const p = this.music.out.gain, t = this.ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(amount, t, 0.02); p.setTargetAtTime(1, t + hold, 0.8); }
  // ---------- loops ----------
  buildLoops() {
    const a = this;
    this.engine = new Loop(this, (c, out) => {
      const ns = c.createBufferSource(); ns.buffer = a.brownBuf; ns.loop = true; const nlp = c.createBiquadFilter(); nlp.type = 'lowpass'; nlp.Q.value = 0.9; nlp.frequency.value = 400; const ng = c.createGain(); ng.gain.value = 0.9;
      ns.connect(nlp); nlp.connect(ng); ng.connect(out);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 80; const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 80.7; const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 200; olp.Q.value = 2; const og = c.createGain(); og.gain.value = 0.22;
      o.connect(olp); o2.connect(olp); olp.connect(og); og.connect(out);
      const w = c.createOscillator(); w.frequency.value = 800; const wg = c.createGain(); wg.gain.value = 0; w.connect(wg); wg.connect(out);
      const hs = c.createBufferSource(); hs.buffer = a.noiseBuf; hs.loop = true; const hbp = c.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 2500; hbp.Q.value = 0.8; const hg = c.createGain(); hg.gain.value = 0; hs.connect(hbp); hbp.connect(hg); hg.connect(out);
      ns.start(0, rv(0, 2)); o.start(); o2.start(); w.start(); hs.start(0, rv(0, 1));
      return { all: [ns, nlp, ng, o, o2, olp, og, w, wg, hs, hbp, hg], nlp, o, o2, olp, og, w, wg, hbp, hg };
    });
    this.laserLoop = new Loop(this, (c, out) => {
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 180; const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 270.6;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 3; const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 420; lfo.connect(lg); lg.connect(bp.frequency);
      const mix = c.createGain(); mix.gain.value = 0.5; o1.connect(bp); o2.connect(bp); bp.connect(mix); mix.connect(out);
      const sub = c.createOscillator(); sub.frequency.value = 90; const sg = c.createGain(); sg.gain.value = 0.35; sub.connect(sg); sg.connect(out);
      const all = [o1, o2, bp, lfo, lg, mix, sub, sg];
      if (!a.low) { const ns = c.createBufferSource(); ns.buffer = a.noiseBuf; ns.loop = true; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500; const am = c.createGain(); am.gain.value = 0.15;
        const fl = c.createOscillator(); fl.type = 'square'; fl.frequency.value = 23; const fg = c.createGain(); fg.gain.value = 0.12; fl.connect(fg); fg.connect(am.gain); ns.connect(hp); hp.connect(am); am.connect(out); ns.start(0, rv(0, 1)); fl.start(); all.push(ns, hp, am, fl, fg); }
      o1.start(); o2.start(); lfo.start(); sub.start(); return { all, o1, o2, sub, lfo };
    });
    this.tractorLoop = new Loop(this, (c, out) => {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; const trem = c.createGain(); trem.gain.value = 0.7; lp.connect(trem); trem.connect(out);
      const lfo = c.createOscillator(); lfo.frequency.value = 5.5; const lg = c.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(trem.gain);
      const os = [[55, 'sine', 0.5], [82.6, 'sine', 0.3], [220, 'triangle', 0.12], [331, 'sine', 0.06]].map(([f, ty, v]) => { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(lp); o.start(); return [o, g]; });
      const sw = c.createOscillator(); sw.frequency.value = 0.4; const swg = c.createGain(); swg.gain.value = 8; sw.connect(swg); for (const [o] of os) swg.connect(o.detune); sw.start(); lfo.start();
      return { all: [lp, trem, lfo, lg, sw, swg, ...os.flat()] };
    });
  }
  // ---------- per-frame update (from main.js) ----------
  tick(dt, st) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.lx = st.x; this.lz = st.z; this.tickT -= dt; if (this.tickT > 0) return; this.tickT = 0.05; // params at 20 Hz
    const c = this.ctx, t = c.currentTime; const live = st.playing && !st.paused && !st.dead;
    // combat state with a hold so the music doesn't flap
    if (st.combat > 0) { this.lastCombat = t; this.combat = Math.max(st.combat, this.combat * 0.98); } else if (t - this.lastCombat > 5) this.combat = 0;
    const mode = st.docked || st.paused || !st.playing ? 'dock' : 'explore';
    this.mood = st.mood || 'peaceful';
    if (this.music) this.music.setMix(mode, st.playing ? this.combat : 0, st.playing ? this.mood : 'peaceful');
    if (this.st && this.music.song) { this.st.tick(); this.st.setLevel(this.combat > 0.02 ? 0.85 : mode === 'dock' ? 0.78 : 1); }
    if (!this.sfxAudible) { this.engine.set(0); this.laserLoop.set(0); this.tractorLoop.set(0); return; }
    // engine: idles quietly, swells with joystick thrust; deeper, bigger and louder per ship tier
    const k = (st.tier - 1) / 4, th = st.thrust;
    if (this.engine.set(live ? (0.07 + 0.2 * th) * (0.75 + 0.5 * k) : 0, 0.12)) { const n = this.engine.n;
      n.nlp.frequency.setTargetAtTime(220 + th * (1500 - 800 * k), t, 0.1);
      const f = (95 - 55 * k) * (1 + 0.35 * th); n.o.frequency.setTargetAtTime(f, t, 0.15); n.o2.frequency.setTargetAtTime(f * 1.009, t, 0.15); n.olp.frequency.setTargetAtTime(f * (2.5 + 3 * th), t, 0.1); n.og.gain.setTargetAtTime(0.15 + 0.2 * k, t, 0.1);
      n.w.frequency.setTargetAtTime((1100 - 750 * k) * (0.85 + 0.35 * th), t, 0.2); n.wg.gain.setTargetAtTime(0.05 * (1 - 0.8 * k) * th, t, 0.1);
      n.hbp.frequency.setTargetAtTime(1800 + 2500 * th - 1000 * k, t, 0.1); n.hg.gain.setTargetAtTime(0.12 * th, t, 0.1); }
    // mining laser
    const lw = live ? this.laserWant : 0;
    if (this.laserLoop.set(lw > 0 ? 0.1 * Math.min(1.6, 0.7 + 0.3 * lw) : 0, 0.04)) { const n = this.laserLoop.n; const f = 180 - 12 * (st.tier - 1);
      n.o1.frequency.setTargetAtTime(f + lw * 8, t, 0.1); n.o2.frequency.setTargetAtTime(f * 1.503, t, 0.1); n.sub.frequency.setTargetAtTime(f / 2, t, 0.1); n.lfo.frequency.setTargetAtTime(8 + rv(-1.5, 1.5), t, 0.2); }
    // docking tractor beam hum (quieter once settled, and under menus)
    this.tractorLoop.set(st.playing && st.docked ? (0.06 + 0.12 * Math.max(0, 1 - st.dockT / 1.5)) * (st.paused ? 0.6 : 1) : 0, 0.25);
    // low-hull alarm
    if (live && !st.docked && st.hull < 0.25) { this.alarmT -= 0.05; if (this.alarmT <= 0) { this.play('alarmLow'); this.alarmT = 1.3; } } else this.alarmT = 0;
  }
  // ---------- game-facing helpers (positions are world x/z) ----------
  laser(on, intensity = 1) { this.laserWant = on ? intensity : 0; }
  shoot(x, z, tier = 1) { this.play('cannon', { x, z, rate: 1.06 - 0.05 * (tier - 1) }); }
  missile(x, z) { this.play('missile', { x, z }); }
  pulse(x, z) { this.play('pulse', { x, z }); this.duck(0.75, 0.2); }
  pdFire(x, z) { this.play('pd', { x, z }); }
  droneFire(x, z) { this.play('droneShot', { x, z }); }
  enemyShoot(type, x, z) {
    if (type === 'gunship') this.play('enemyHeavy', { x, z });
    else if (type === 'boss') this.play('enemyHeavy', { x, z, rate: 0.75, vol: 1.3 });
    else this.play('enemyLaser', { x, z, rate: type === 'drone' || type === 'sentinel' ? 1.15 : 0.95 });
  }
  hit(x, z) { this.play('hitHull', { x, z }); }
  missileBoom(x, z) { this.play('boomS', { x, z, rate: 1.35, vol: 0.55 }); }
  rockHit(x, z) { this.play('rockHit', { x, z }); }
  rockBreak(big, x, z) { this.play(big ? 'rockL' : 'rockS', { x, z }); }
  explode(big, x, z, boss) { this.play(big ? 'boomL' : 'boomS', { x, z, vol: boss ? 1.3 : 1, rate: boss ? 0.8 : 1 }); if (big) this.duck(boss ? 0.35 : 0.55, boss ? 1 : 0.35); }
  hurt(shielded, x, z) { if (shielded) { this.play('shieldHit', { x, z }); this.play('hitHull', { x, z, vol: 0.5, rate: 0.8 }); } else this.play('hullCrunch', { x, z }); }
  pickup(n = 0) { const step = n % 10; const semi = PENT[step % 5] + 12 * Math.floor(step / 5); this.play('pickup', { rate: Math.pow(2, (semi - 5) / 12) }); }
  click() { this.play('tap'); }
  menuOpen() { this.play('open'); }
  menuClose() { this.play('close'); }
  coins() { this.play('coins'); }
  upgrade() { this.play('upgrade'); }
  levelUp() { this.play('levelUp'); }
  questComplete() { this.play('quest'); this.play('coins', { vol: 0.5, delay: 0.5 }); }
  tierUp() { this.play('fanfare'); this.duck(0.3, 3); }
  stationUp() { this.play('fanfare', { rate: 0.94 }); this.duck(0.3, 3); }
  alarm() { this.play('pirate'); }
  saved() { this.play('save'); }
  warp() { this.play('warp'); }
  boost() { this.play('boost'); }
  docked() { this.play('dock'); }
  // v4
  ability(id, x, z) { const m = { dash: 'dash', emp: 'emp', overload: 'overload', surge: 'surge', barrage: 'missile', drones: 'deploy' }; this.play(m[id] || 'tap', { x, z, vol: id === 'barrage' ? 1.4 : 1 }); if (id === 'emp') this.duck(0.5, 0.6); if (id === 'barrage') this.play('missile', { x, z, delay: 0.12, rate: 1.1 }); }
  lootDrop(r, x, z) { this.play('lootDrop', { x, z, rate: 1 + r * 0.06 }); }
  loot(r) { this.play(r >= 3 ? 'lootRare' : 'loot', { rate: r >= 3 ? 1 + (r - 3) * 0.06 : 1 + r * 0.06 }); }
  sector() { this.play('sector'); }
  skill() { this.play('skill'); }
  overheat() { this.play('overheat'); }
  denied() { this.play('denied'); }
  shieldDown() { this.play('shieldDown'); }
  liberate() { this.play('liberate'); this.duck(0.15, 4.5); }
  // ---------- diagnostics (used by the headless tests) ----------
  debug() {
    const c = this.ctx; if (!c) return { ctx: false };
    const m = this.music;
    return { ctx: true, state: c.state, sampleRate: c.sampleRate, ready: this.ready, renderMs: this.renderMs, bufferKB: Math.round((this.bufferBytes || 0) / 1024), sounds: Object.keys(this.buf).length,
      rms: Object.fromEntries(Object.entries(this.buf).map(([k, bs]) => { const d = bs[0].getChannelData(0); let q = 0; for (let i = 0; i < d.length; i++) q += d[i] * d[i]; return [k, +(10 * Math.log10(q / d.length + 1e-12)).toFixed(1)]; })),
      voices: this.voices.length, maxVoices: this.maxVoices, low: this.low, stats: { ...this.stats, played: { ...this.stats.played } },
      loops: { engine: !!this.engine.g, laser: !!this.laserLoop.g, tractor: !!this.tractorLoop.g },
      bus: { master: this.master.gain.value, sfx: this.sfxBus.gain.value, music: this.musicBus.gain.value },
      song: this.st ? { ...this.st.state(), started: this.st.started, dead: this.st.dead, level: this.st.out.gain.value, decks: this.st.decks.map((d) => ({ idx: d.idx, gain: +d.g.gain.value.toFixed(3), paused: d.el.paused, t: +d.el.currentTime.toFixed(2), src: d.el.currentSrc })) } : null, musicMode: this.musicMode || 'soundtrack',
      layers: m ? { amb: m.amb.gain.value, cbt: m.cbt.gain.value, dock: m.dock.gain.value, target: { ...m.target }, mood: m.mood, lite: !!m.lite } : null, combat: this.combat, mood: this.mood };
  }
  // Offline render of a heavy combat burst through the same master chain, to check for clipping.
  async renderTestMix(sec = 4) {
    if (!this.ready) return null; const sr = 44100; const oc = new OfflineAudioContext(2, sr * sec, sr);
    const L = oc.createDynamicsCompressor(); L.threshold.value = -3; L.knee.value = 0; L.ratio.value = 20; L.attack.value = 0.002; L.release.value = 0.12; L.connect(oc.destination);
    const C = oc.createDynamicsCompressor(); C.threshold.value = -16; C.knee.value = 10; C.ratio.value = 3.5; C.attack.value = 0.004; C.release.value = 0.25; C.connect(L);
    const M = oc.createGain(); M.gain.value = 1.1; M.connect(C); const pre = { peak: 0 };
    const tap = oc.createGain(); tap.connect(M);
    const put = (name, t, v = 1, pan = 0) => { const s = oc.createBufferSource(); s.buffer = pick(this.buf[name]); const g = oc.createGain(); g.gain.value = MIX[name][0] * v; const p = oc.createStereoPanner(); p.pan.value = pan; s.connect(g); g.connect(p); p.connect(tap); s.start(t); };
    for (let t = 0; t < sec - 0.5; t += 0.12) { put('cannon', t, 1, rv(-0.3, 0.3)); if (Math.random() < 0.5) put('hitHull', t + 0.05, 1, rv(-0.8, 0.8)); if (Math.random() < 0.4) put('enemyLaser', t, 1, rv(-1, 1)); }
    for (let t = 0.2; t < sec - 1; t += 0.7) { put('boomS', t, 1, rv(-0.6, 0.6)); put('missile', t, 1); }
    put('boomL', 0.5); put('boomL', 1.6, 1, 0.5); put('pulse', 1.0); put('hullCrunch', 1.1); put('shieldHit', 2); put('fanfare', 0.3); put('pirate', 0);
    const b = await oc.startRendering(); let peak = 0, sum = 0, clip = 0, n = 0;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; sum += d[i] * d[i]; n++; } }
    return { peak: +peak.toFixed(3), peakDb: +(20 * Math.log10(peak)).toFixed(2), rmsDb: +(10 * Math.log10(sum / n)).toFixed(2), clippedSamples: clip, pre };
  }
}
