// v6 physics: Newtonian-hybrid flight model, impulse collisions, broadphase spatial hash and swept projectile tests.
// Pure math (no three.js) so it can be unit-tested headlessly.
import { clamp, angleDiff } from './util.js?v=6';

// ---------------------------------------------------------------- masses
export const TIER_MASS = [1.2, 2.8, 6, 13, 30];
export const ENEMY_MASS = { drone: 0.5, interceptor: 1, sentinel: 1.3, sniper: 1.4, support: 1.6, ew: 1.4, gunship: 3.5, freighter: 7, capital: 32, commander: 45, flagship: 500, boss: 500 };
export function massOf(e) { if (e.D && (e.D.inst || e.D.part)) return Infinity; return ENEMY_MASS[e.type] ?? 2; }
export function rockMass(r, rich) { return (rich ? 1.6 : 1) * 0.55 * r * r * r; } // density ~ rock, mass grows with volume

// ---------------------------------------------------------------- flight model
// assist 0..1: 0 = near-Newtonian (long drift, slow stabilisers), 1 = arcade (vectored thrust, strong stabilisers)
export const ASSIST_LEVELS = { low: 0.3, normal: 0.65, high: 1 };
export function assistValue(s) { return typeof s === 'number' ? clamp(s, 0, 1) : ASSIST_LEVELS[s] ?? ASSIST_LEVELS.normal; }
export class FlightModel {
  constructor() { this.out = { main: 0, rcsL: 0, rcsR: 0, latL: 0, latR: 0, brake: 0, boost: 0, ax: 0, az: 0, angAcc: 0 }; }
  // p: {x,z,vx,vz,yaw,yawVel,mass}; st: {accel, speed, turn}; input: {x,z} (stick, |v|<=1); o: {assist, maxMul, boost}
  step(p, st, input, dt, o = {}) {
    const A = o.assist ?? 0.65; const out = this.out; const m = Math.min(1, Math.hypot(input.x, input.z));
    const max = st.speed * (o.maxMul || 1); const thrustA = st.accel * (o.boost ? 1.6 : 1); // thrust force / mass = acceleration
    const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw); // heading
    // ---- rotation: torque-limited angular controller (angular momentum carries through)
    const turnMax = st.turn * (0.85 + 0.35 * A); const angAccMax = st.turn * (2.6 + 5 * A);
    let wantVel = 0;
    const sp = Math.hypot(p.vx, p.vz);
    if (m > 0.08) wantVel = clamp(angleDiff(p.yaw, Math.atan2(input.x, input.z)) * (3 + 3 * A), -turnMax, turnMax);
    else if (sp > 1.5 && A > 0.5) wantVel = clamp(angleDiff(p.yaw, Math.atan2(p.vx, p.vz)) * 1.5, -turnMax * 0.5, turnMax * 0.5); // assist: weathervane into drift
    const angAcc = clamp((wantVel - p.yawVel) / Math.max(dt, 1e-4), -angAccMax, angAccMax);
    p.yawVel += angAcc * dt; p.yaw += p.yawVel * dt; out.angAcc = angAcc / angAccMax;
    // ---- linear
    let ax = 0, az = 0; out.main = 0; out.brake = 0; out.latL = out.latR = 0;
    if (m > 0.08) {
      const ux = input.x / m, uz = input.z / m; const align = hx * ux + hz * uz;
      const main = m * Math.max(0, align) ** 1.5; // main engine pushes along the nose
      const vec = m * A * 0.75; // vectored manoeuvring thrust straight along the stick (the 'assist')
      ax += hx * thrustA * main + ux * thrustA * vec; az += hz * thrustA * main + uz * thrustA * vec;
      out.main = main + (o.boost ? 0.6 : 0);
      // stabilisers: kill velocity perpendicular to the commanded direction (reduces unwanted drift)
      const along = p.vx * ux + p.vz * uz; const lx = p.vx - ux * along, lz = p.vz - uz * along; const kLat = 0.5 + 3.2 * A;
      ax -= lx * kLat; az -= lz * kLat;
      const side = lx * hz - lz * hx; if (Math.abs(side) > 0.5) { if (side > 0) out.latR = Math.min(1, side * 0.15); else out.latL = Math.min(1, -side * 0.15); }
      if (along < -1) { out.brake = Math.min(1, -along / max); } // reversing: retro thrusters
    } else if (sp > 0.05) {
      // no input: retro-thrusters decelerate progressively; momentum carries briefly (less with more assist)
      const brakeA = thrustA * (0.18 + 0.55 * A); const dv = Math.min(sp, brakeA * dt);
      ax -= p.vx / sp * dv / Math.max(dt, 1e-4); az -= p.vz / sp * dv / Math.max(dt, 1e-4); out.brake = Math.min(1, sp / max) * (0.3 + 0.7 * A);
    }
    // passive damping (space dust / game feel) + speed limiter (soft: excess bled off by the flight computer)
    const pd = 0.08 + 0.12 * A; ax -= p.vx * pd; az -= p.vz * pd;
    p.vx += ax * dt; p.vz += az * dt;
    const s2 = Math.hypot(p.vx, p.vz); if (s2 > max) { const k = Math.max(max / s2, Math.exp(-6 * dt)); p.vx *= k; p.vz *= k; }
    p.x += p.vx * dt; p.z += p.vz * dt;
    out.ax = ax; out.az = az; out.boost = o.boost ? 1 : 0;
    out.rcsL = Math.max(0, -out.angAcc); out.rcsR = Math.max(0, out.angAcc);
    return out;
  }
}

// ---------------------------------------------------------------- impulse collisions
// a, b: {x,z,vx,vz,m,r, yawVel?, I?}. Returns {j (impulse), vn (closing speed), e (impact energy), nx, nz} or null.
export function collideCircles(a, b, rest = 0.35, slop = 0.02) {
  const dx = b.x - a.x, dz = b.z - a.z; const min = a.r + b.r; if (Math.abs(dx) > min || Math.abs(dz) > min) return null;
  const d2 = dx * dx + dz * dz; if (d2 >= min * min) return null;
  const d = Math.sqrt(d2) || 1e-4; const nx = dx / d, nz = dz / d;
  const ia = a.m === Infinity ? 0 : 1 / a.m, ib = b.m === Infinity ? 0 : 1 / b.m; const isum = ia + ib; if (isum === 0) return null;
  // positional correction (split by inverse mass) so heavy bodies barely move
  const pen = min - d - slop; if (pen > 0) { const c = pen / isum; a.x -= nx * c * ia; a.z -= nz * c * ia; b.x += nx * c * ib; b.z += nz * c * ib; }
  const rvx = b.vx - a.vx, rvz = b.vz - a.vz; const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return { j: 0, vn: 0, e: 0, nx, nz };
  const j = -(1 + rest) * vn / isum;
  a.vx -= j * nx * ia; a.vz -= j * nz * ia; b.vx += j * nx * ib; b.vz += j * nz * ib;
  // friction-ish tangential impulse -> spin (rotational reaction, bigger for light ships)
  const tx = -nz, tz = nx; const vt = rvx * tx + rvz * tz; const jt = clamp(-vt / isum, -Math.abs(j) * 0.3, Math.abs(j) * 0.3);
  a.vx -= jt * tx * ia; a.vz -= jt * tz * ia; b.vx += jt * tx * ib; b.vz += jt * tz * ib;
  if (a.yawVel !== undefined && ia) a.yawVel -= jt * a.r * ia / Math.max(0.3, a.r * a.r * 0.5) + (Math.abs(j) * ia) * 0.08 * Math.sign(vt || 1);
  if (b.yawVel !== undefined && ib) b.yawVel += jt * b.r * ib / Math.max(0.3, b.r * b.r * 0.5);
  const mu = 1 / isum; const e = 0.5 * mu * vn * vn; // impact energy in the centre-of-mass frame
  return { j, vn: -vn, e, nx, nz };
}

// ---------------------------------------------------------------- broadphase
export class SpatialHash {
  constructor(cell = 12) { this.cell = cell; this.inv = 1 / cell; this.map = new Map(); this.stamp = 0; this.pool = []; }
  clear() { for (const a of this.map.values()) { a.length = 0; this.pool.push(a); } this.map.clear(); }
  key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
  insert(o, x, z, r) {
    const i0 = Math.floor((x - r) * this.inv), i1 = Math.floor((x + r) * this.inv), k0 = Math.floor((z - r) * this.inv), k1 = Math.floor((z + r) * this.inv);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const key = this.key(i, k); let a = this.map.get(key); if (!a) { a = this.pool.pop() || []; this.map.set(key, a); } a.push(o); }
  }
  // collect unique objects overlapping an AABB into out[]
  queryBox(x0, z0, x1, z1, out) {
    out.length = 0; const s = ++this.stamp;
    const i0 = Math.floor(Math.min(x0, x1) * this.inv), i1 = Math.floor(Math.max(x0, x1) * this.inv), k0 = Math.floor(Math.min(z0, z1) * this.inv), k1 = Math.floor(Math.max(z0, z1) * this.inv);
    if ((i1 - i0 + 1) * (k1 - k0 + 1) > 400) return out; // absurd query: refuse rather than stall
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) { const a = this.map.get(this.key(i, k)); if (!a) continue; for (const o of a) if (o._hs !== s) { o._hs = s; out.push(o); } }
    return out;
  }
  query(x, z, r, out) { return this.queryBox(x - r, z - r, x + r, z + r, out); }
}

// ---------------------------------------------------------------- swept tests
// segment P0->P1 vs circle (cx,cz,r): earliest t in [0,1] of contact, or -1 (handles starting inside: t = 0)
export function sweptCircle(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0, dz = z1 - z0; const fx = x0 - cx, fz = z0 - cz;
  const c = fx * fx + fz * fz - r * r; if (c <= 0) return 0;
  const a = dx * dx + dz * dz; if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fz * dz); if (b >= 0) return -1; // moving away
  const disc = b * b - 4 * a * c; if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a); return t >= 0 && t <= 1 ? t : -1;
}
