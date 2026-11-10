// v7 graphics presets + device capability detection (auto) + adaptive downgrade under sustained load.
export const PRESETS = {
  low: { label: 'LOW', desc: 'Reduced particles, simplified lighting, 1× resolution, no bloom or post effects. Best for older phones and battery life.',
    pr: 1, bloom: 0, post: false, particles: 0.45, smoke: 0, lights: false, nebula: 1, planets: 1, bgRocks: 0, fgRocks: 0, rockLod: 22, fragments: 24, sky: 0, dust: false, motes: false },
  medium: { label: 'MEDIUM', desc: 'Balanced lighting, moderate particles, bloom, layered nebulae and planets with clouds. Recommended for most phones.',
    pr: 1.5, bloom: 0.8, post: true, particles: 0.8, smoke: 0.6, lights: true, nebula: 2, planets: 2, bgRocks: 28, fgRocks: 0, rockLod: 45, fragments: 48, sky: 1, dust: true, motes: false },
  high: { label: 'HIGH', desc: 'Enhanced lighting, detailed particles, full-resolution effects, cratered planets, lensing and depth layers. For recent flagships and desktops.',
    pr: 2, bloom: 0.9, post: true, particles: 1, smoke: 1, lights: true, nebula: 3, planets: 3, bgRocks: 56, fgRocks: 14, rockLod: 70, fragments: 80, sky: 1, dust: true, motes: true },
};
export const QUALITY_KEYS = ['low', 'medium', 'high'];
const LOW_GPU = /SwiftShader|llvmpipe|Software|Mali-4|Mali-T[678]|Adreno \(TM\) [2345]\d\d|PowerVR SGX|PowerVR Rogue G|Intel\(R\) HD Graphics [2-5]\d{2,3}\b|Intel\(R\) HD Graphics$/i;
const HIGH_GPU = /Apple (M\d|GPU)|Adreno \(TM\) (6[4-9]\d|7\d\d|8\d\d)|Mali-G(7[1-9]|7\d\d|9\d\d)|Immortalis|Xclipse|NVIDIA|GeForce|RTX|Quadro|Radeon|AMD|Intel\(R\) (Iris|Arc)/i;
export function detectQuality(renderer) {
  let gpu = 'unknown';
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { /* privacy-restricted */ }
  const nav = typeof navigator !== 'undefined' ? navigator : {}; const cores = nav.hardwareConcurrency || 4; const mem = nav.deviceMemory || 0;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || '') || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  const dpr = (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1; const px = (typeof screen !== 'undefined' ? screen.width * screen.height : 1e6) * dpr * dpr;
  let score = 0; const why = [];
  if (LOW_GPU.test(gpu)) { score -= 3; why.push('entry-level / software GPU'); } else if (HIGH_GPU.test(gpu)) { score += 3; why.push('capable GPU'); } else why.push('unrecognised GPU');
  if (cores >= 8) score += 1; else if (cores <= 4) { score -= 1; why.push(cores + ' CPU cores'); }
  if (mem) { if (mem >= 6) score += 1; else if (mem <= 3) { score -= 1; why.push(mem + ' GB memory'); } }
  if (mobile && px > 3.6e6) { score -= 1; why.push('very high-resolution screen'); }
  const q = score >= 3 ? 'high' : score >= 0 ? 'medium' : 'low';
  return { q, score, gpu, cores, mem, mobile, why: why.join(', ') };
}
// sustained-load watchdog: steps the AUTO preset down one level if frames stay slow (thermal throttling, busy scenes)
export class AdaptiveQuality {
  constructor() { this.t = 0; this.slow = 0; this.cool = 6; }
  tick(rawDt, level) { // returns the level to switch to, or null
    this.cool -= rawDt; this.t += rawDt; if (rawDt > 1 / 26) this.slow += rawDt; else this.slow = Math.max(0, this.slow - rawDt * 0.5);
    if (this.cool > 0) { this.slow = 0; return null; }
    if (this.slow > 4 && level !== 'low') { this.slow = 0; this.cool = 12; return level === 'high' ? 'medium' : 'low'; }
    return null;
  }
}
