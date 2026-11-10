// v7 cinematic post pass (medium/high only): screen-space gravitational lensing and shock ripples, restrained colour
// grading (lift/gamma/gain + saturation in linear HDR before tone mapping) and a soft vignette. One full-screen pass;
// the lens loop only runs for active lenses (max 4), so the idle cost is a single texture fetch + a few ALU ops.
import * as THREE from 'three';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';

const CinematicShader = {
  uniforms: { tDiffuse: { value: null }, uLens: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uMode: { value: new THREE.Vector4() }, uCount: { value: 0 }, uAspect: { value: 1 },
    uVig: { value: 0.32 }, uSat: { value: 1.08 }, uLift: { value: new THREE.Vector3(0.0, 0.002, 0.006) }, uGain: { value: new THREE.Vector3(1.02, 1.0, 0.98) }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec4 uLens[4]; uniform vec4 uMode; uniform int uCount; uniform float uAspect; uniform float uVig; uniform float uSat; uniform vec3 uLift; uniform vec3 uGain; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec2 uv = vUv; float shadow = 0.0; float ringGlow = 0.0;
      for (int i = 0; i < 4; i++) {
        if (i >= uCount) break;
        vec4 L = uLens[i]; float mode = i==0?uMode.x:i==1?uMode.y:i==2?uMode.z:uMode.w;
        vec2 d = uv - L.xy; d.x *= uAspect; float r = length(d) + 1e-5; vec2 dir = d / r;
        if (mode < 0.5) { // gravity well: deflection ~ rs^2 / r, faded out at the influence radius
          float rs = L.z; float fall = 1.0 - smoothstep(rs*3.0, rs*6.0, r);
          float defl = L.w * rs*rs / max(r, rs*0.6) * fall; uv -= vec2(dir.x/uAspect, dir.y) * defl;
          shadow = max(shadow, (1.0 - smoothstep(rs*0.95, rs*1.05, r)) * step(1.5, L.w*10.0));
          ringGlow += exp(-pow((r - rs*1.08)/(rs*0.06), 2.0)) * step(1.5, L.w*10.0);
        } else { // expanding shock ripple
          float w = L.z*0.18 + 0.004; float k = exp(-pow((r - L.z)/w, 2.0)); uv -= vec2(dir.x/uAspect, dir.y) * k * L.w;
        }
      }
      vec3 c = texture2D(tDiffuse, uv).rgb;
      c = mix(c, vec3(0.0), shadow) + vec3(1.6,1.2,0.8)*ringGlow*0.25;
      // grade: lift / gain, gentle saturation, sector tint in the shadows
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat); c = c*uGain + uLift*uTint*(1.0 - clamp(l*4.0, 0.0, 1.0));
      vec2 q = vUv - 0.5; q.x *= uAspect; c *= 1.0 - uVig*smoothstep(0.35, 0.95, length(q)*1.25);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
export class CinematicPass {
  constructor() { this.pass = new ShaderPass(CinematicShader); this.lenses = []; this.v = new THREE.Vector3(); }
  get uniforms() { return this.pass.uniforms; }
  // world lenses for this frame: {x,y,z, rWorld, strength, mode}; projected to screen and sorted by strength
  setLenses(list, camera, aspect) {
    const U = this.pass.uniforms; let n = 0; U.uAspect.value = aspect; const proj = [];
    for (const L of list) {
      const v = this.v.set(L.x, L.y || 0, L.z).project(camera); if (v.z > 1) continue;
      const sx = v.x * 0.5 + 0.5, sy = v.y * 0.5 + 0.5;
      // world radius -> screen radius (in uv-y units) via a second projected point
      const e = this.v.set(L.x + L.r, L.y || 0, L.z).project(camera); const rr = Math.hypot((e.x * 0.5 + 0.5 - sx) * aspect, e.y * 0.5 + 0.5 - sy);
      if (sx < -rr * 6 || sx > 1 + rr * 6 || sy < -rr * 6 || sy > 1 + rr * 6) continue;
      proj.push({ sx, sy, rr, s: L.s, mode: L.mode || 0 });
    }
    proj.sort((a, b) => b.s - a.s);
    for (const p of proj) { if (n >= 4) break; U.uLens.value[n].set(p.sx, p.sy, p.rr, p.s); U.uMode.value.setComponent(n, p.mode); n++; }
    U.uCount.value = n; this.count = n; return n;
  }
}
