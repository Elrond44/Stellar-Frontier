import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { Game } from './game.js?v=6';
import { UI } from './ui.js?v=6';
import { Audio } from './audio.js?v=6';
import { makeSky, makeStarLayer, makeDust } from './world.js?v=6';
import { SECTORS, sectorAt } from './data.js?v=6';
import { owner } from './galaxy.js?v=6';

const canvas = document.getElementById('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('loadMsg').textContent = 'WebGL is not available on this device/browser.';
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050a18, 0.0042);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2000);

// lights
scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x221830, 0.55));
const key = new THREE.DirectionalLight(0xffe6c8, 2.2); key.position.set(-30, 60, 25); scene.add(key);
const rim = new THREE.DirectionalLight(0x5aa0ff, 1.1); rim.position.set(40, 15, -50); scene.add(rim);
const fill = new THREE.DirectionalLight(0xff8a50, 0.5); fill.position.set(30, -10, 40); scene.add(fill);

// environment map for metallic reflections (one-time PMREM of a gradient nebula sphere)
{
  const envScene = new THREE.Scene();
  const eg = new THREE.SphereGeometry(10, 32, 16);
  const em = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; void main(){ float t=vP.y*0.5+0.5; vec3 c=mix(vec3(0.05,0.03,0.08),vec3(0.35,0.5,0.8),t); c+=vec3(1.4,0.9,0.6)*pow(max(0.0,dot(vP,normalize(vec3(-0.5,0.8,0.4)))),12.0); c+=vec3(0.2,0.5,1.0)*pow(max(0.0,dot(vP,normalize(vec3(0.7,0.2,-0.7)))),6.0)*0.6; gl_FragColor=vec4(c,1.0);}' });
  envScene.add(new THREE.Mesh(eg, em));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.8; pm.dispose();
}
// background
const sky = makeSky(); scene.add(sky);
const stars1 = makeStarLayer(1600, 500, -140, -90, 0.35, 1.8, 11); scene.add(stars1);
const stars2 = makeStarLayer(700, 300, -60, -30, 0.22, 1.4, 12); scene.add(stars2);
const motes = makeStarLayer(260, 140, -6, 4, 0.06, 0.3, 13); scene.add(motes);
const dust = makeDust(); scene.add(dust);
const starLayers = [stars1, stars2, motes];

const audio = new Audio();
const game = new Game(scene, camera, audio);
const opts = { canvas, showFps: false, fpsText: () => '', applySettings: null, isPlaying: () => playing, onLoaded: null };
const ui = new UI(game, audio, opts);

// post-processing
let composer = null, bloom = null, quality = 'medium';
function setupQuality() {
  const q = game.s.settings.quality === 'auto' ? quality : game.s.settings.quality;
  const dpr = window.devicePixelRatio || 1;
  const pr = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  game.fx.budget = q === 'low' ? 0.5 : 1; game.setQuality(q); audio.setLow(q === 'low');
  sky.material.uniforms.uDetail.value = q === 'low' ? 0 : 1; dust.visible = q !== 'low'; motes.visible = q === 'high';
  if (q === 'low') { composer = null; bloom = null; }
  else {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), q === 'high' ? 0.9 : 0.8, 0.5, 0.92);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }
  resize();
}
function applySettings(audioOnly) {
  const s = game.s.settings; audio.setVolumes({ master: s.masterVol, music: s.musicVol, sfx: s.sfxVol, mute: s.mute }); audio.setMusicMode(s.musicMode);
  if (audioOnly === true) return;
  opts.showFps = s.fps; document.getElementById('fps').style.display = s.fps ? '' : 'none';
  setupQuality();
}
opts.applySettings = applySettings;
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.fov = w < h ? 52 : 46; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (composer) { composer.setSize(w, h); }
  const scale = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  game.fx.mat.uniforms.uScale.value = scale; game.smoke.mat.uniforms.uScale.value = scale; for (const l of starLayers) l.material.uniforms.uScale.value = scale;
}
addEventListener('resize', resize);
applySettings();

// fps tracking + auto quality
let frames = 0, fpsAcc = 0, fps = 60, autoChecked = false, autoT = 0, slowFrames = 0;
opts.fpsText = () => `${fps.toFixed(0)} fps · ${renderer.info.render.calls} draws · ${game.fx.active} particles`;

// title
let playing = false;
const title = document.getElementById('title');
const btnPlay = document.getElementById('btnPlay'), btnNew = document.getElementById('btnNew'), btnLoad = document.getElementById('btnLoad');
const hasSave = !!localStorage.getItem('stellar-frontier-save-v1');
document.getElementById('loadMsg').classList.add('hidden');
btnPlay.classList.remove('hidden'); btnLoad.classList.remove('hidden');
if (hasSave) { btnPlay.textContent = `CONTINUE · LV ${game.s.level}`; btnNew.classList.remove('hidden'); }
function startGame() {
  if (playing) return;
  audio.init(); applySettings(true);
  title.classList.add('gone'); playing = true; setTimeout(() => title.remove(), 700);
  ui.sectorBanner(game.gsec);
  if (game.s.migratedFrom) { delete game.s.migratedFrom; game.save(); setTimeout(() => ui.toast(`Save upgraded to v4: your weapons are now items and you have ${game.spAvail()} skill points to spend`, 'level'), 2500); }
  if (game.offlineGain > 1) ui.toast(`Your factory produced ${Math.floor(game.offlineGain)} credits while you were away`, 'good');
  if (!game.s.tutorialDone) { game.s.tutorialDone = true; setTimeout(() => ui.toast('Mine asteroids, fill your cargo, then return to the station to sell.'), 1500); }
  else document.getElementById('hint').classList.add('gone');
}
btnPlay.addEventListener('click', startGame);
btnLoad.addEventListener('click', () => { audio.init(); applySettings(true); ui.open('saves'); });
opts.onLoaded = () => { if (!playing) { game.offlineGain = 0; startGame(); } };
let newArmed = 0;
btnNew.addEventListener('click', () => {
  if (Date.now() - newArmed < 3500) { game.reset(); return; }
  newArmed = Date.now(); btnNew.textContent = 'Tap again to erase progress'; setTimeout(() => { btnNew.textContent = 'New game'; }, 3500);
});

// autosave
setInterval(() => { if (playing) game.save(); }, 8000);
addEventListener('visibilitychange', () => { if (document.hidden && playing) game.save(); });
addEventListener('pagehide', () => { if (playing) game.save(); });

// sky tint per sector
const tint = new THREE.Vector3(...SECTORS[0].tint); const ownCol = {};
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta(); const dt = Math.min(rawDt, 1 / 20);
  frames++; fpsAcc += rawDt; if (fpsAcc >= 0.5) { fps = frames / fpsAcc; frames = 0; fpsAcc = 0; }
  const t0 = performance.now();
  if (playing && !ui.modalOpen) {
    game.update(dt);
    if (game.s.settings.quality === 'auto' && !autoChecked) {
      autoT += rawDt; if (rawDt > 1 / 32) slowFrames++;
      if (autoT > 5) { autoChecked = true; if (slowFrames / (autoT * 50) > 0.5 && quality !== 'low') { quality = 'low'; setupQuality(); ui.toast('Graphics set to LOW for smoother play (change in Settings)'); } }
    }
  } else if (!playing) {
    game.time += dt; game.player.yaw += dt * 0.2; game.player.group.rotation.y = game.player.yaw;
    game.field.update(game.player.x, game.player.z, game.time, dt);
  }
  ui.update(dt, innerWidth, innerHeight);
  audioTick(rawDt);
  game.updateCamera(dt, innerWidth / innerHeight);
  // background follow
  sky.position.copy(camera.position);
  const sec = sectorAt(Math.hypot(game.player.x, game.player.z)); const own = owner(game.gsec, game.s.galaxy); const oc = (ownCol[own.id] ||= new THREE.Color(own.color));
  const tt = [sec.tint[0] * 0.65 + oc.r * 0.35, sec.tint[1] * 0.65 + oc.g * 0.35, sec.tint[2] * 0.65 + oc.b * 0.35];
  tint.x += (tt[0] - tint.x) * dt * 0.8; tint.y += (tt[1] - tint.y) * dt * 0.8; tint.z += (tt[2] - tint.z) * dt * 0.8;
  sky.material.uniforms.uTint.value.copy(tint); sky.material.uniforms.uTime.value = game.time;
  for (const l of starLayers) l.material.uniforms.uCam.value.set(camera.position.x, camera.position.z);
  dust.material.uniforms.uCam.value.set(camera.position.x, camera.position.z); dust.material.uniforms.uVel.value.set(game.player.vx, game.player.vz);
  const t1 = performance.now();
  if (composer) composer.render(); else renderer.render(scene, camera);
  perf.upd = perf.upd * 0.95 + (t1 - t0) * 0.05; perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
}
const perf = { upd: 0, calls: 0, tris: 0 };
// soundtrack: the manifest is tiny; each song streams only when it is about to play
audio.musicMode = game.s.settings.musicMode;
fetch('music/tracks.json?v=6').then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))).then((list) => {
  if (!Array.isArray(list) || !list.length) return; const s = game.s.settings;
  audio.setTracks(list, s.trackIdx < list.length ? s.trackIdx : 0, s.trackIdx < list.length ? s.trackPos : 0);
}).catch((e) => console.info('No soundtrack, using generated music:', e.message));
audio.onTrack = (i, title) => { if (playing) ui.toast(`♪ Now playing: ${title}`); if (ui.modalOpen === 'settings') ui.render(); };
audio.onSongFail = () => { if (playing) ui.toast('Soundtrack unavailable, switched to generated music'); };
function audioTick(dt) {
  if (!audio.ctx) return; const g = game, p = g.player; let threat = 0;
  if (playing && !g.dead) for (const e of g.enemies) { if (e.dead || e.D.part || e.hold || ((e.type === 'sentinel' || e.D.boss) && e.state === 'idle')) continue; if (Math.hypot(e.x - p.x, e.z - p.z) < 60) threat += e.D.boss ? 3 : e.type === 'gunship' || e.type === 'capital' ? 1.5 : e.battle ? 0.5 : 1; }
  const ts = audio.trackState(); if (ts) { g.s.settings.trackIdx = ts.idx; g.s.settings.trackPos = ts.pos; }
  // music mood: peaceful (haven/liberated), mysterious (newly charted / unclaimed), tense (pirate territory), intense (boss, outpost assault, big battle)
  const gs = g.gsec, G = g.s.galaxy; let mood = 'peaceful';
  if (gs.faction !== 'haven' && !G.liberated[gs.id]) mood = gs.faction === 'neutral' || g.time - g.secEnterT < 90 ? 'mysterious' : 'tense';
  const bossOn = !!g.camp.bossActive(); const outpostNear = g.camp.instNear(70); const battleNear = !!g.camp.skirmishNear(60);
  if (bossOn || outpostNear || battleNear || threat >= 5) mood = 'intense';
  g.mood = mood;
  audio.tick(Math.min(dt, 0.25), { x: p.x, z: p.z, thrust: p.thrust || 0, tier: g.s.tier, docked: g.docked, dockT: g.dockT || 0, combat: Math.min(1, threat / 3), hull: p.maxHp ? p.hp / p.maxHp : 1, dead: g.dead, paused: !!ui.modalOpen, playing, mood });
}
resize();
frame();

// test / debug hook
window.SF = { perf, game, ui, audio, renderer, camera, scene, get fps() { return fps; }, setQuality(q) { game.s.settings.quality = q; applySettings(); } };
