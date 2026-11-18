// v13 camera & controls: presets, defaults, key bindings and save validation.
// The camera itself stays in Game.updateCamera and input stays in UI.bind/readInput; this module only holds
// the shared tunables so the settings screen, the save file and the controller agree on one schema.
export const DEG = Math.PI / 180;
// Classic = the original fixed 58° follow camera (yaw 0, zoom 1, full contextual framing).
export const CAM_PRESETS = {
  classic: { label: 'CLASSIC', name: 'Classic', pitch: 1.02, zoom: 1, frame: 'full', lead: 1, follow: 1, rot: 1, desc: 'The original high follow view: wide, readable, north-up by default.' },
  dynamic: { label: 'DYNAMIC', name: 'Dynamic', pitch: 48 * DEG, zoom: 0.88, frame: 'mild', lead: 1.35, follow: 1.15, rot: 1, desc: 'Lower and closer with more look-ahead: feels fast, good for dogfights.' },
  tactical: { label: 'TACTICAL', name: 'Tactical', pitch: 78 * DEG, zoom: 1.55, frame: 'full', lead: 0.7, follow: 0.95, rot: 1, desc: 'High overhead view zoomed out: best awareness for fleets, mining and capitals.' },
  cinematic: { label: 'CINEMA', name: 'Cinematic', pitch: 32 * DEG, zoom: 0.72, frame: 'mild', lead: 1.2, follow: 0.7, rot: 0.55, desc: 'Low over-the-hull angle with slow, smooth motion: best for screenshots and big hulls.' },
};
export const PRESET_ORDER = ['classic', 'dynamic', 'tactical', 'cinematic'];
// rebindable keyboard actions (arrow keys always move as well)
export const BIND_DEFAULTS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'Space', camLeft: 'KeyQ', camRight: 'KeyE', camUp: 'PageUp', camDown: 'PageDown', zoomIn: 'Equal', zoomOut: 'Minus', reset: 'KeyR', recenter: 'KeyC', preset: 'KeyV' };
export const BIND_LABELS = { up: 'Thrust forward', down: 'Thrust back', left: 'Strafe left', right: 'Strafe right', boost: 'Boost / dash', camLeft: 'Rotate camera left', camRight: 'Rotate camera right', camUp: 'Tilt camera up', camDown: 'Tilt camera down', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset camera', recenter: 'Camera behind ship', preset: 'Next camera style' };
// keys the game already uses for menus and abilities; they cannot be rebound to camera / movement actions
export const RESERVED_KEYS = ['Escape', 'KeyU', 'KeyM', 'KeyG', 'KeyK', 'KeyI', 'KeyF', 'KeyH', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
export function keyName(code) {
  if (!code) return '—'; if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5);
  return { Space: 'Space', Equal: '+ / =', Minus: '−', PageUp: 'PgUp', PageDown: 'PgDn', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Backquote: '`', Enter: 'Enter', Backspace: 'Bksp' }[code] || code.replace(/^Numpad/, 'Num ');
}
export function camDefaults() {
  return { preset: 'classic', sensX: 1, sensY: 1, zoomSens: 1, invertY: false, invertX: false, zoomSmooth: 0.2, rotSmooth: 'normal', follow: 'normal', lookAhead: 1,
    zoomMax: 2, pitchMin: 25, pitchMax: 82, autoFrame: 'full', autoBehind: 'off', collide: true, fade: true, camRel: true, twist: true,
    joyMode: 'floating', joySize: 1, joyDead: 0.08, moveZone: 'lower', binds: { ...BIND_DEFAULTS }, view: { yaw: 0, pitch: 1.02, zoom: 1 } };
}
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const one = (v, list, d) => (list.includes(v) ? v : d);
// validates / migrates the settings.cam block (older saves have none: they get the Classic preset = the old camera)
export function sanitizeCam(c) {
  const D = camDefaults(); if (!c || typeof c !== 'object') return D;
  const o = { preset: one(c.preset, PRESET_ORDER, D.preset), sensX: num(c.sensX, 1, 0.1, 3), sensY: num(c.sensY, 1, 0.1, 3), zoomSens: num(c.zoomSens, 1, 0.1, 3), invertY: c.invertY === true, invertX: c.invertX === true,
    zoomSmooth: one(c.zoomSmooth, [0.1, 0.2, 0.35], 0.2), rotSmooth: one(c.rotSmooth, ['snappy', 'normal', 'smooth'], 'normal'), follow: one(c.follow, ['tight', 'normal', 'loose'], 'normal'), lookAhead: one(c.lookAhead, [0, 0.5, 1, 1.5], 1),
    zoomMax: one(c.zoomMax, [1.5, 2, 2.5], 2), pitchMin: one(c.pitchMin, [20, 25, 35], 25), pitchMax: one(c.pitchMax, [70, 82, 85], 82), autoFrame: one(c.autoFrame, ['off', 'mild', 'full'], D.autoFrame), autoBehind: one(c.autoBehind, ['off', 'slow', 'normal'], 'off'),
    collide: c.collide !== false, fade: c.fade !== false, camRel: c.camRel !== false, twist: c.twist !== false,
    joyMode: one(c.joyMode, ['floating', 'fixed'], 'floating'), joySize: one(c.joySize, [0.8, 1, 1.25], 1), joyDead: num(c.joyDead, 0.08, 0, 0.3), moveZone: one(c.moveZone, ['lower', 'anywhere'], 'lower'), binds: { ...BIND_DEFAULTS }, view: { ...D.view } };
  if (c.binds && typeof c.binds === 'object') for (const k in BIND_DEFAULTS) { const v = c.binds[k]; if (typeof v === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v) && !RESERVED_KEYS.includes(v)) o.binds[k] = v; }
  // a key may drive one action only: later duplicates fall back to their defaults (or nothing if that is taken too)
  const seen = new Set(); for (const k in o.binds) { if (seen.has(o.binds[k])) o.binds[k] = seen.has(BIND_DEFAULTS[k]) ? '' : BIND_DEFAULTS[k]; if (o.binds[k]) seen.add(o.binds[k]); }
  const v = c.view || {}; o.view = { yaw: num(v.yaw, 0, -1e4, 1e4), pitch: num(v.pitch, CAM_PRESETS[o.preset].pitch, 20 * DEG, 85 * DEG), zoom: num(v.zoom, CAM_PRESETS[o.preset].zoom, 0.4, 2.5) };
  return o;
}
// wrap an angle difference into (-PI, PI] so resets take the shortest way round
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d <= -Math.PI) d += Math.PI * 2; return d; }
