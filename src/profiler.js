// v7 in-game profiler: frame/update/render time, physics/AI/particles/bolts/world sections, particle counts, draw calls,
// texture memory estimate, GC (heap drops, Chromium only) and a thermal/sustained-performance indicator.
const SECTIONS = ['update', 'ai', 'physics', 'weapons', 'bolts', 'particles', 'world', 'phenomena', 'render'];
export class Profiler {
  constructor(renderer, scene) {
    this.r = renderer; this.scene = scene; this.sec = {}; for (const k of SECTIONS) this.sec[k] = { avg: 0, max: 0, cur: 0 };
    this.frames = new Float32Array(240); this.fi = 0; this.n = 0; this.heap = 0; this.gcEvents = 0; this.gcFreed = 0; this.t = 0;
    this.base = 0; this.win = { t: 0, sum: 0, n: 0 }; this.ratio = 1; this.texT = 0; this.tex = { count: 0, mb: 0, rtMb: 0 }; this.battery = null;
    if (typeof navigator !== 'undefined' && navigator.getBattery) navigator.getBattery().then((b) => { this.battery = b; }).catch(() => {});
  }
  add(k, ms) { const s = this.sec[k]; s.cur += ms; }
  endFrame(rawDt, extra) {
    for (const k in this.sec) { const s = this.sec[k]; s.avg = s.avg * 0.94 + s.cur * 0.06; s.max = Math.max(s.max * 0.995, s.cur); s.cur = 0; }
    this.frames[this.fi] = rawDt * 1000; this.fi = (this.fi + 1) % this.frames.length; this.n = Math.min(this.n + 1, this.frames.length); this.t += rawDt;
    // GC: a large drop in the used JS heap between frames means a collection ran
    const pm = typeof performance !== 'undefined' && performance.memory; if (pm) { const h = pm.usedJSHeapSize; if (this.heap && h < this.heap - 512 * 1024) { this.gcEvents++; this.gcFreed += this.heap - h; } this.heap = h; }
    // thermal / sustained performance: 10 s windows vs the best early window
    const W = this.win; W.t += rawDt; W.sum += rawDt; W.n++; if (W.t >= 10) { const ft = W.sum / W.n; if (!this.base || (this.t < 90 && ft < this.base)) this.base = ft; this.ratio = ft / this.base; W.t = W.sum = W.n = 0; }
    this.texT -= rawDt; if (this.texT <= 0) { this.texT = 3; this.measureTextures(extra && extra.targets); }
    this.extra = extra || {};
  }
  measureTextures(targets) {
    const seen = new Set(); let bytes = 0;
    const addTex = (t) => { if (!t || !t.isTexture || seen.has(t)) return; seen.add(t); const img = t.image || {}; const w = img.width || (t.source && t.source.data && t.source.data.width) || 0, h = img.height || 0; bytes += w * h * 4 * (t.generateMipmaps !== false ? 1.33 : 1) * (t.isCubeTexture || t.mapping === 306 ? 6 : 1); };
    this.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const k in m) if (m[k] && m[k].isTexture) addTex(m[k]); if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) addTex(v); } } });
    if (this.scene.environment) addTex(this.scene.environment);
    let rt = 0; for (const t of targets || []) if (t) rt += t.width * t.height * (t.texture && t.texture.type === 1016 ? 8 : 4);
    this.tex = { count: this.r.info.memory.textures, mb: bytes / 1048576, rtMb: rt / 1048576 };
  }
  frameStats() { const a = Array.from(this.frames.slice(0, this.n)).sort((x, y) => x - y); if (!a.length) return { avg: 0, p95: 0, max: 0 }; const avg = a.reduce((s, v) => s + v, 0) / a.length; return { avg, p95: a[Math.floor(a.length * 0.95)] || avg, max: a[a.length - 1] }; }
  thermal() { const r = this.ratio; return r > 1.35 ? 'throttling suspected' : r > 1.15 ? 'warming' : 'stable'; }
  snapshot() {
    const f = this.frameStats(); const S = {}; for (const k in this.sec) S[k] = +this.sec[k].avg.toFixed(3); const R = this.r.info.render;
    return { frameMs: +f.avg.toFixed(2), p95Ms: +f.p95.toFixed(2), maxMs: +f.max.toFixed(2), fps: f.avg ? +(1000 / f.avg).toFixed(1) : 0, sections: S, drawCalls: R.calls, triangles: R.triangles, programs: (this.r.info.programs || []).length,
      geometries: this.r.info.memory.geometries, textures: this.tex.count, texMB: +this.tex.mb.toFixed(1), targetsMB: +this.tex.rtMb.toFixed(1), heapMB: this.heap ? +(this.heap / 1048576).toFixed(1) : null, gcEvents: this.gcEvents,
      thermal: this.thermal(), sustainRatio: +this.ratio.toFixed(2), battery: this.battery ? { level: this.battery.level, charging: this.battery.charging } : null, ...this.extra };
  }
  text() {
    const s = this.snapshot(); const S = s.sections; const x = s;
    return `${x.fps} fps · ${x.frameMs} ms (p95 ${x.p95Ms}) · ${x.quality || ''}\nupd ${S.update.toFixed(1)} · ai ${S.ai.toFixed(1)} · phys ${S.physics.toFixed(1)} · fx ${S.particles.toFixed(1)} · env ${S.phenomena.toFixed(1)} · draw ${S.render.toFixed(1)} ms\n${x.drawCalls} draws · ${(x.triangles / 1000).toFixed(0)}k tris · ${x.particles || 0} particles\ntex ${x.textures} (${x.texMB} MB + RT ${x.targetsMB} MB) · heap ${x.heapMB ?? 'n/a'} MB · GC ${x.gcEvents}\nthermal: ${x.thermal}${x.battery ? ` · battery ${Math.round(x.battery.level * 100)}%${x.battery.charging ? '+' : ''}` : ''}`;
  }
}
