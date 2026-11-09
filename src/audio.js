// WebAudio synthesized SFX + generative ambient music
export class Audio {
  constructor() { this.ctx = null; this.sfxOn = true; this.musicOn = true; this.last = {}; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 0.55 : 0; this.sfx.connect(this.comp);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.22 : 0; this.music.connect(this.comp);
    const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // reverb-ish delay for music
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.38; const fb = c.createGain(); fb.gain.value = 0.35;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(this.music);
    // laser hum
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 110;
    this.humF = c.createBiquadFilter(); this.humF.type = 'lowpass'; this.humF.frequency.value = 900;
    this.humG = c.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humF); this.humF.connect(this.humG); this.humG.connect(this.sfx); this.hum.start();
    this.startMusic();
  }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05); }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.3); }
  ok(name, gap) { if (!this.ctx || !this.sfxOn) return false; const t = this.ctx.currentTime; if (this.last[name] && t - this.last[name] < gap) return false; this.last[name] = t; return true; }
  tone(type, f0, f1, dur, vol, dest = this.sfx, when = 0) {
    const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol, f0, f1, type = 'lowpass', q = 1, when = 0) {
    const c = this.ctx, t = c.currentTime + when; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  laser(on, intensity = 1) { if (!this.ctx) return; const v = on && this.sfxOn ? 0.05 * intensity : 0; this.humG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); this.hum.frequency.setTargetAtTime(100 + intensity * 30, this.ctx.currentTime, 0.1); }
  shoot() { if (this.ok('shoot', 0.05)) { this.tone('square', 900, 180, 0.08, 0.08); this.noise(0.05, 0.08, 4000, 800); } }
  enemyShoot() { if (this.ok('eshoot', 0.09)) this.tone('sawtooth', 500, 120, 0.12, 0.05); }
  missile() { if (this.ok('missile', 0.12)) { this.noise(0.35, 0.18, 800, 3000, 'bandpass', 2); this.tone('sine', 200, 500, 0.3, 0.05); } }
  pulse() { if (this.ok('pulse', 0.2)) { this.tone('sine', 120, 40, 0.5, 0.4); this.noise(0.4, 0.15, 2000, 200, 'lowpass'); } }
  hit() { if (this.ok('hit', 0.06)) this.noise(0.06, 0.12, 2500, 600, 'bandpass', 3); }
  rockBreak(big) { if (this.ok('rock', 0.05)) { this.noise(big ? 0.6 : 0.35, big ? 0.5 : 0.3, 1500, 80); this.tone('sine', 90, 35, 0.35, 0.3); } }
  explode(big) { if (this.ok('boom', 0.05)) { this.noise(big ? 1.4 : 0.7, big ? 0.8 : 0.5, 3000, 60); this.tone('sine', big ? 70 : 110, 30, big ? 1.0 : 0.5, 0.5); } }
  pickup(n = 0) { if (this.ok('pick', 0.035)) this.tone('sine', 880 * Math.pow(1.06, n % 12), 1320 * Math.pow(1.06, n % 12), 0.09, 0.07); }
  hurt() { if (this.ok('hurt', 0.12)) { this.noise(0.2, 0.3, 900, 200); this.tone('square', 160, 60, 0.18, 0.08); } }
  click() { if (this.ok('click', 0.03)) this.tone('triangle', 1200, 900, 0.05, 0.08); }
  coins() { if (!this.ok('coins', 0.2)) return; [0, 0.06, 0.12, 0.2].forEach((w, i) => this.tone('triangle', [1046, 1318, 1568, 2093][i], [1046, 1318, 1568, 2093][i], 0.18, 0.12, this.sfx, w)); }
  upgrade() { if (!this.ok('up', 0.1)) return; [523, 659, 784, 1046].forEach((f, i) => this.tone('sawtooth', f, f * 1.01, 0.3, 0.06, this.sfx, i * 0.05)); this.tone('sine', 262, 262, 0.6, 0.15); }
  levelUp() { if (!this.ok('lvl', 0.5)) return; [392, 523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.25, 0.06, this.sfx, i * 0.09)); }
  alarm() { if (!this.ok('alarm', 2)) return; for (let i = 0; i < 3; i++) this.tone('sawtooth', 600, 400, 0.25, 0.08, this.sfx, i * 0.3); }
  startMusic() {
    const c = this.ctx; const chords = [[110, 164.8, 220, 277.2], [98, 146.8, 196, 246.9], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 293.7]];
    let step = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2; lp.connect(this.music); lp.connect(this.delay);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 350; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const playChord = () => {
      const t = c.currentTime; const ch = chords[step % chords.length];
      for (const f of ch) for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 2.5); g.gain.linearRampToValueAtTime(0.0001, t + 8.5);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + 8.6);
      }
      // sparse arpeggio
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.45) continue;
        const f = ch[Math.floor(Math.random() * 4)] * 4; const tt = t + i * 0.95;
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.03, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.8);
        o.connect(g); g.connect(this.music); g.connect(this.delay); o.start(tt); o.stop(tt + 0.9);
      }
      // sub bass
      const b = c.createOscillator(); b.type = 'sine'; b.frequency.value = ch[0] / 2; const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.12, t + 1); bg.gain.linearRampToValueAtTime(0.0001, t + 8);
      b.connect(bg); bg.connect(this.music); b.start(t); b.stop(t + 8.1);
      step++;
    };
    playChord(); this.musicTimer = setInterval(() => { if (c.state === 'running') playChord(); }, 8000);
  }
}
