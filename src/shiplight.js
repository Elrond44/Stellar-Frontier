// blender-tex: cinematic hull lighting (Medium / High only, and only with the texture test toggle on, so the
// default game keeps today's look). A PMREM environment made from the game's own sky shader (nebula glow, planets)
// plus soft key / rim lobes so dark sectors still give polished metal something to reflect, and stronger key/rim lights.
import * as THREE from 'three';
const VS = 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const FS = `uniform float k; varying vec3 vP; void main(){ float t=vP.y*0.5+0.5; vec3 c=mix(vec3(0.03,0.02,0.05),vec3(0.24,0.34,0.6),t)*0.75;
  c+=vec3(1.7,1.1,0.75)*pow(max(0.0,dot(vP,normalize(vec3(-0.5,0.8,0.4)))),10.0);
  c+=vec3(0.3,0.6,1.3)*pow(max(0.0,dot(vP,normalize(vec3(0.7,0.2,-0.7)))),5.0)*0.85;
  c+=vec3(1.0,0.45,0.25)*pow(max(0.0,dot(vP,normalize(vec3(0.6,-0.3,0.7)))),8.0)*0.35; gl_FragColor=vec4(c*k,1.0);}`;
export function skyEnv(renderer, skyMat, boost = 1) {
  const es = new THREE.Scene();
  if (skyMat) { const m = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMat); m.frustumCulled = false; es.add(m); }
  const lobes = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, uniforms: { k: { value: boost } }, vertexShader: VS, fragmentShader: FS }));
  lobes.renderOrder = 1; es.add(lobes);
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(es, 0.015).texture; pm.dispose();
  lobes.geometry.dispose(); lobes.material.dispose(); return t;
}
// q: 'low' | 'medium' | 'high'; L = { scene, renderer, key, rim, sky, baseEnv }
export const SHIPLIGHT = { on: false, env: null, q: null };
export function applyShipLight(L, q, enabled) {
  const on = enabled && q !== 'low'; SHIPLIGHT.on = on; SHIPLIGHT.q = q;
  if (!on) { L.scene.environment = L.baseEnv; L.scene.environmentIntensity = 0.8; L.key.intensity = 2.2; L.rim.intensity = 1.1; return; }
  SHIPLIGHT.env ||= skyEnv(L.renderer, L.sky && L.sky.material);
  L.scene.environment = SHIPLIGHT.env; L.scene.environmentIntensity = q === 'high' ? 1.05 : 0.95;
  L.key.intensity = 2.55; L.rim.intensity = q === 'high' ? 2.1 : 1.8;
}
